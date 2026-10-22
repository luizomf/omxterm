// Regenerates src/shared/highlight-rules/ashyterm-rules.json from AshyTerm's
// MIT-licensed rule files (CommunityBigLinux/ashyterm,
// src/ashyterm/data/highlights). Usage:
//   node scripts/import-ashyterm-highlights.mjs <ashyterm checkout>
// The output is sorted and normalized so regeneration is reproducible.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const checkout = process.argv[2];
if (!checkout) {
  console.error("usage: import-ashyterm-highlights.mjs <ashyterm checkout>");
  process.exit(2);
}
const source = path.join(checkout, "src", "ashyterm", "data", "highlights");
const output = path.resolve(
  import.meta.dirname,
  "../src/shared/highlight-rules/ashyterm-rules.json",
);

// AshyTerm compiles every rule case-insensitively; JavaScript has no inline
// global (?i) flag, so a leading one is removed rather than translated.
const normalizePattern = (pattern) => pattern.replace(/^\(\?i\)/u, "");

const contexts = [];
for (const file of (await readdir(source))
  .filter((name) => name.endsWith(".json"))
  .sort()) {
  const data = JSON.parse(await readFile(path.join(source, file), "utf8"));
  const rules = (data.rules ?? []).map((rule) => {
    const pattern = normalizePattern(rule.pattern);
    new RegExp(pattern, "gi");
    return {
      name: rule.name,
      pattern,
      colors: rule.colors ?? ["white"],
      ...(rule.enabled === false ? { enabled: false } : {}),
      ...(rule.description ? { description: rule.description } : {}),
    };
  });
  contexts.push({
    name: data.name,
    triggers: data.triggers ?? [data.name],
    ...(data.description ? { description: data.description } : {}),
    ...(data.use_global_rules ? { useGlobalRules: true } : {}),
    ...(data.enabled === false ? { enabled: false } : {}),
    rules,
  });
}
await writeFile(
  output,
  `${JSON.stringify({ source: "CommunityBigLinux/ashyterm (MIT)", contexts }, null, 2)}\n`,
);
console.log(
  `Wrote ${contexts.length} contexts and ${contexts.reduce((sum, context) => sum + context.rules.length, 0)} rules`,
);
