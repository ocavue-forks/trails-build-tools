// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { TEMP_DATA_DIR } from "./testing/paths";
import { generateAllowedBlock, updateConfig } from "./updateConfig";
import { PackageEntry } from "./findDuplicates";

const UPDATE_CONFIG_DIR = resolve(TEMP_DATA_DIR, "update-config");

function makeDuplicates(
    entries: { name: string; versions: string[] }[]
): Map<string, PackageEntry> {
    const map = new Map<string, PackageEntry>();
    for (const entry of entries) {
        map.set(entry.name, entry);
    }
    return map;
}

beforeEach(() => {
    rmSync(UPDATE_CONFIG_DIR, { recursive: true, force: true });
    mkdirSync(UPDATE_CONFIG_DIR, { recursive: true });
});

describe("generateAllowedBlock", () => {
    it("generates a correctly formatted allowed block", () => {
        const duplicates = makeDuplicates([
            { name: "prettier", versions: ["2.8.8", "3.3.3"] },
            { name: "@changesets/types", versions: ["4.1.0", "6.0.0"] }
        ]);
        const block = generateAllowedBlock(duplicates);
        expect(block).toBe(
            `allowed:\n` +
                `  - "@changesets/types" # (versions 4.1.0, 6.0.0)\n` +
                `  - "prettier" # (versions 2.8.8, 3.3.3)\n`
        );
    });

    it("sorts entries alphabetically by package name", () => {
        const duplicates = makeDuplicates([
            { name: "zod", versions: ["1.0.0", "2.0.0"] },
            { name: "argparse", versions: ["1.0.10", "2.0.1"] },
            { name: "chalk", versions: ["2.4.2", "4.1.2"] }
        ]);
        const block = generateAllowedBlock(duplicates);
        const lines = block.split("\n").filter((l) => l.startsWith("  -"));
        expect(lines[0]).toContain('"argparse"');
        expect(lines[1]).toContain('"chalk"');
        expect(lines[2]).toContain('"zod"');
    });
});

describe("updateConfig", () => {
    it("updates an existing allowed field", () => {
        const configPath = resolve(UPDATE_CONFIG_DIR, "config-existing.yaml");
        writeFileSync(
            configPath,
            `skipDevDependencies: true\nallowed:\n  - "old-package"\n`,
            "utf-8"
        );

        const duplicates = makeDuplicates([
            { name: "prettier", versions: ["2.8.8", "3.3.3"] },
            { name: "@pnpm/dependency-path", versions: ["5.1.3", "5.1.6"] }
        ]);
        updateConfig(configPath, duplicates);

        const result = readFileSync(configPath, "utf-8");
        expect(result).toContain("skipDevDependencies: true");
        expect(result).toContain(`  - "@pnpm/dependency-path" # (versions 5.1.3, 5.1.6)`);
        expect(result).toContain(`  - "prettier" # (versions 2.8.8, 3.3.3)`);
        expect(result).not.toContain("old-package");
    });

    it("adds allowed field when not present", () => {
        const configPath = resolve(UPDATE_CONFIG_DIR, "config-no-allowed.yaml");
        writeFileSync(configPath, `skipDevDependencies: true\n`, "utf-8");

        const duplicates = makeDuplicates([{ name: "prettier", versions: ["2.8.8", "3.3.3"] }]);
        updateConfig(configPath, duplicates);

        const result = readFileSync(configPath, "utf-8");
        expect(result).toContain("skipDevDependencies: true");
        expect(result).toContain(`  - "prettier" # (versions 2.8.8, 3.3.3)`);
    });

    it("preserves extra fields", () => {
        const configPath = resolve(UPDATE_CONFIG_DIR, "config-extra.yaml");
        writeFileSync(
            configPath,
            `skipDevDependencies: true\nextraField: hello\nallowed:\n  - "old-package"\n`,
            "utf-8"
        );

        const duplicates = makeDuplicates([{ name: "chalk", versions: ["2.4.2", "4.1.2"] }]);
        updateConfig(configPath, duplicates);

        const result = readFileSync(configPath, "utf-8");
        expect(result).toContain("skipDevDependencies: true");
        expect(result).toContain("extraField: hello");
        expect(result).toContain('  - "chalk" # (versions 2.4.2, 4.1.2)');
        expect(result).not.toContain("old-package");
    });

    it("adds a header comment", () => {
        const configPath = resolve(UPDATE_CONFIG_DIR, "config-header.yaml");
        writeFileSync(configPath, `skipDevDependencies: true\n`, "utf-8");

        const duplicates = makeDuplicates([{ name: "prettier", versions: ["2.8.8", "3.3.3"] }]);
        updateConfig(configPath, duplicates);

        const result = readFileSync(configPath, "utf-8");
        expect(result).toContain("# Configuration file for check-pnpm-duplicates.");
        expect(result).toContain(
            "# See https://www.npmjs.com/package/@open-pioneer/check-pnpm-duplicates for more details."
        );
    });

    it("formats entries with JSON.stringify and version comments", () => {
        const configPath = resolve(UPDATE_CONFIG_DIR, "config-format.yaml");
        writeFileSync(configPath, `allowed:\n  - "x"\n`, "utf-8");

        const duplicates = makeDuplicates([
            { name: "@scope/pkg", versions: ["1.0.0", "2.0.0", "3.0.0"] }
        ]);
        updateConfig(configPath, duplicates);

        const result = readFileSync(configPath, "utf-8");
        expect(result).toContain('  - "@scope/pkg" # (versions 1.0.0, 2.0.0, 3.0.0)');
    });
});
