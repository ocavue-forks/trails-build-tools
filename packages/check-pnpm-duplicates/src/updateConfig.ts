// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { dump as dumpYaml } from "js-yaml";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { formatPackageEntries, PackageEntry } from "./findDuplicates";
import { maybeReadRawConfig } from "./readConfig";

/**
 * Generates the `allowed:` YAML block from the given duplicates map.
 *
 * Entries are sorted alphabetically by package name.
 * Each entry includes a comment with the detected versions.
 */
export function generateAllowedBlock(duplicates: Map<string, PackageEntry>): string {
    const entries = [...duplicates.values()].sort((a, b) => a.name.localeCompare(b.name));
    return "allowed:\n" + formatPackageEntries(entries) + "\n";
}

/**
 * Updates the `allowed` field in the given YAML config file
 * with the current set of duplicate packages.
 *
 * The existing config is read with {@link safeReadConfig} (creating a default
 * if the file does not exist yet). The file is then re-generated with js-yaml;
 * all non-`allowed` fields are preserved and a header comment is added.
 */
export function updateConfig(configPath: string, duplicates: Map<string, PackageEntry>): void {
    const existingConfig = maybeReadRawConfig(configPath);
    mkdirSync(dirname(configPath), { recursive: true });
    const entries = [...duplicates.values()].sort((v1, v2) => v1.name.localeCompare(v2.name));

    const lines: string[] = [
        "# Configuration file for check-pnpm-duplicates.",
        "# See https://www.npmjs.com/package/@open-pioneer/check-pnpm-duplicates for more details.",
        existingConfig.skipDevDependencies != null
            ? `skipDevDependencies: ${existingConfig.skipDevDependencies}`
            : "",
        entries.length > 0 ? `allowed:` : `allowed: []`,
        entries.length > 0 ? formatPackageEntries(entries) : ""
    ];
    const text = lines.join("\n").trim() + "\n";
    writeFileSync(configPath, text, "utf-8");
}
