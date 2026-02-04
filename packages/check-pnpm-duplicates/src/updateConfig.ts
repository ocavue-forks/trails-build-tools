// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { load as loadYaml, dump as dumpYaml } from "js-yaml";
import { readFileSync, writeFileSync } from "node:fs";
import { formatPackageEntries, PackageEntry } from "./findDuplicates";

const CONFIG_HEADER =
    `# Configuration file for check-pnpm-duplicates.\n` +
    `# See https://www.npmjs.com/package/@open-pioneer/check-pnpm-duplicates for more details.\n`;

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
 * The file is parsed with js-yaml and re-generated.
 * All non-`allowed` fields are preserved; a header comment is added.
 */
export function updateConfig(configPath: string, duplicates: Map<string, PackageEntry>): void {
    const content = readFileSync(configPath, "utf-8");
    const rawConfig = (loadYaml(content) as Record<string, unknown>) ?? {};

    // Separate `allowed` from other config fields
    const { allowed: _, ...otherFields } = rawConfig;

    // Build the new config file.
    // Joining with "\n" creates blank-line separation between sections.
    const parts: string[] = [CONFIG_HEADER];
    if (Object.keys(otherFields).length > 0) {
        parts.push(dumpYaml(otherFields));
    }
    parts.push(generateAllowedBlock(duplicates));

    writeFileSync(configPath, parts.join("\n"), "utf-8");
}
