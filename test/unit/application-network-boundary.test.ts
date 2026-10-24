import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function sourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(absolute)));
    else if (entry.name.endsWith(".ts")) files.push(absolute);
  }
  return files;
}

describe("Application Network Boundary", () => {
  it("contains no application-owned network, telemetry, crash, update, or remote-log capability", async () => {
    const root = path.resolve(import.meta.dirname, "../../src");
    const sources = await sourceFiles(root);
    const forbidden = [
      /from\s+["']node:(?:http|https|http2|net|tls|dgram)["']/u,
      /import\s*\{[^}]*\bnet\b[^}]*\}\s*from\s*["']electron["']/u,
      /\bfetch\s*\(/u,
      /\bnet\.(?:fetch|request)\s*\(/u,
      /\.(?:loadURL|downloadURL)\s*\(/u,
      /\bXMLHttpRequest\b/u,
      /\bWebSocket\b/u,
      /\bnavigator\.sendBeacon\b/u,
      /\bcrashReporter\b/u,
      /\bautoUpdater\b/u,
      /\b(?:analytics|telemetry|remoteLogger)\b/u,
    ];

    for (const file of sources) {
      const source = await readFile(file, "utf8");
      for (const pattern of forbidden) expect(source).not.toMatch(pattern);
    }
  });

  it("keeps terminal and fixed About link opening at their validated main-process call sites", async () => {
    const root = path.resolve(import.meta.dirname, "../../src");
    const matches: string[] = [];
    for (const file of await sourceFiles(root)) {
      const source = await readFile(file, "utf8");
      if (source.includes("shell.openExternal"))
        matches.push(path.relative(root, file).split(path.sep).join("/"));
    }

    expect(matches).toEqual(["main/application-about.ts", "main/index.ts"]);
  });
});
