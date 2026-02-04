// src/index.ts
import { Command } from "commander";
import { cwd, exit } from "node:process";

// src/readLockfile.ts
import { readWantedLockfile } from "@pnpm/lockfile.fs";
async function readLockfile(directory) {
  const lockFile = await readWantedLockfile(directory, {
    ignoreIncompatible: false
  });
  if (!lockFile) {
    throw new Error(`Failed to find a lockfile in ${directory}`);
  }
  return lockFile;
}

// src/findDuplicates.ts
import { nameVerFromPkgSnapshot } from "@pnpm/lockfile.utils";
import { lockfileWalker } from "@pnpm/lockfile.walker";
function formatPackageEntries(entries) {
  return entries.map((entry) => {
    const versions = entry.versions.join(", ");
    return `  - ${JSON.stringify(entry.name)} # (versions ${versions})`;
  }).join("\n");
}
async function findDuplicatePackages(lockfile, skipDevDependencies) {
  const seenPackages = /* @__PURE__ */ new Map();
  const walker = lockfileWalker(lockfile, typedKeys(lockfile.importers), {
    include: {
      dependencies: true,
      optionalDependencies: true,
      devDependencies: !skipDevDependencies
    }
  });
  const visitDeps = (deps) => {
    for (const dep of deps) {
      const { name, version: version2 } = nameVerFromPkgSnapshot(dep.depPath, dep.pkgSnapshot);
      let entry = seenPackages.get(name);
      if (!entry) {
        entry = { name, versions: [] };
        seenPackages.set(name, entry);
      }
      if (!entry.versions.includes(version2)) {
        entry.versions.push(version2);
        visitDeps(dep.next().dependencies);
      }
    }
  };
  visitDeps(walker.step.dependencies);
  for (const [name, entry] of seenPackages) {
    if (entry.versions.length < 2) {
      seenPackages.delete(name);
    } else {
      entry.versions.sort();
    }
  }
  return seenPackages;
}
function typedKeys(object) {
  return Object.keys(object);
}

// package.json
var version = "0.2.6";

// src/readConfig.ts
import { load as loadYaml } from "js-yaml";
import { readFileSync, existsSync } from "node:fs";
function emptyConfig() {
  return {
    skipDevDependencies: false,
    rules: []
  };
}
function readRawConfig(path) {
  try {
    const content = readFileSync(path, "utf-8");
    const rawConfig = loadYaml(content);
    const allowed = rawConfig == null ? void 0 : rawConfig.allowed;
    const skipDevDependencies = rawConfig == null ? void 0 : rawConfig.skipDevDependencies;
    if (allowed !== void 0 && !Array.isArray(allowed)) {
      throw new Error("Expected 'allowed' to be an array of strings");
    }
    if (skipDevDependencies !== void 0 && typeof skipDevDependencies !== "boolean") {
      throw new Error("Expected 'skipDevDependencies' to be a boolean");
    }
    return { allowed, skipDevDependencies };
  } catch (e) {
    throw new Error(`Failed to read config file from ${path}: ${e}`, { cause: e });
  }
}
function maybeReadRawConfig(path) {
  if (!existsSync(path)) {
    return {};
  }
  return readRawConfig(path);
}
function readConfig(path) {
  const rawConfig = readRawConfig(path);
  const allowed = rawConfig.allowed ?? [];
  const skipDevDependencies = rawConfig.skipDevDependencies ?? false;
  const config = {
    skipDevDependencies,
    rules: allowed.map((packageName) => {
      return {
        allowedPackageName: packageName,
        matched: false
      };
    })
  };
  return config;
}

// src/generateReport.ts
function generateReport(config, duplicates) {
  const unexpectedPackages = getUnexpectedDuplicates(config, duplicates);
  const unusedRules = getUnusedRules(config);
  if (unexpectedPackages.length > 0) {
    console.error(`Found unexpected duplicate packages:`);
    console.error(formatPackageEntries(unexpectedPackages));
    console.error(``);
    console.error(`To resolve these issues, consider taking one of the following steps:`);
    console.error(`  - Run 'pnpm dedupe'`);
    console.error(
      `  - Investigate why the package is duplicated (try running 'pnpm why -r <package>') and try to resolve the duplication.`
    );
    console.error(
      `  - If the duplication is not a problem, add the package to the allowed list in the configuration file.`
    );
  } else {
    console.log(`No unexpected duplicate packages found.`);
  }
  if (unusedRules.length) {
    console.warn(``);
    console.warn(
      `The following rules did not match any packages. They can be removed from the configuration file:`
    );
    for (const rule of unusedRules) {
      console.warn(`  - ${rule.allowedPackageName}`);
    }
  }
  return unexpectedPackages.length === 0;
}
function getUnexpectedDuplicates(config, duplicates) {
  const unexpectedPackages = [];
  for (const entry of duplicates.values()) {
    const allowed = config.rules.find((rule) => {
      if (rule.allowedPackageName === entry.name) {
        rule.matched = true;
        return true;
      } else {
        return false;
      }
    });
    if (!allowed) {
      unexpectedPackages.push(entry);
    }
  }
  unexpectedPackages.sort((v1, v2) => {
    return v1.name.localeCompare(v2.name);
  });
  return unexpectedPackages;
}
function getUnusedRules(config) {
  const rules = config.rules.filter((rule) => !rule.matched);
  rules.sort((v1, v2) => {
    return v1.allowedPackageName.localeCompare(v2.allowedPackageName);
  });
  return rules;
}

// src/updateConfig.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
function updateConfig(configPath, duplicates) {
  const existingConfig = maybeReadRawConfig(configPath);
  mkdirSync(dirname(configPath), { recursive: true });
  const entries = [...duplicates.values()].sort((v1, v2) => v1.name.localeCompare(v2.name));
  const lines = [
    "# Configuration file for check-pnpm-duplicates.",
    "# See https://www.npmjs.com/package/@open-pioneer/check-pnpm-duplicates for more details.",
    existingConfig.skipDevDependencies != null ? `skipDevDependencies: ${existingConfig.skipDevDependencies}` : "",
    entries.length > 0 ? `allowed:` : `allowed: []`,
    entries.length > 0 ? formatPackageEntries(entries) : ""
  ];
  const text = lines.filter(Boolean).join("\n") + "\n";
  writeFileSync(configPath, text, "utf-8");
}

// src/index.ts
var program = new Command();
program.name("check-pnpm-duplicates").description("Checks a pnpm lockfile for duplicate packages.").option("-c, --config <path>", "path to the configuration file").option("-d, --debug", "show exception stack traces").option("-u, --update", "update the config file's allowed list with current duplicates").version(version);
program.parse();
async function main() {
  const chalk = (await import("chalk")).default;
  const opts = program.opts();
  const configPath = opts.config;
  const debug = opts.debug ?? false;
  const update = opts.update ?? false;
  try {
    if (update && !configPath) {
      throw new Error("The --update flag requires a config file path (--config).");
    }
    const directory = cwd();
    const config = configPath ? readConfig(configPath) : emptyConfig();
    let lockfile;
    try {
      lockfile = await readLockfile(directory);
    } catch (e) {
      throw new Error(`Failed to read lockfile in ${directory}`, { cause: e });
    }
    let duplicates;
    try {
      duplicates = await findDuplicatePackages(lockfile, config.skipDevDependencies);
    } catch (e) {
      throw new Error(`Could not analyze lockfile for duplicates`, { cause: e });
    }
    const ok = generateReport(config, duplicates);
    if (update && configPath && duplicates.size > 0) {
      updateConfig(configPath, duplicates);
      console.log(`Updated allowed list in ${configPath}`);
    }
    exit(update || ok ? 0 : 1);
  } catch (e) {
    if (debug) {
      console.error(e);
    } else {
      console.error(chalk.red(e.message ?? String(e)));
      console.error("Run with --debug for more information.");
    }
    exit(1);
  }
}
main().catch((e) => {
  console.error("Fatal error", e);
  exit(1);
});
//# sourceMappingURL=index.js.map
