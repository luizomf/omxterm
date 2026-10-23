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
      // The opt-in AI assistant is the one documented exception (docs/spec.md,
      // AI assistant); it is checked separately below.
      if (file === path.join(root, "main", "assistant-service.ts")) continue;
      const source = await readFile(file, "utf8");
      for (const pattern of forbidden) expect(source).not.toMatch(pattern);
      expect(source).not.toMatch(/=\s*fetch\b/u);
    }
  });

  it("confines network access to the opt-in assistant service in main", async () => {
    const root = path.resolve(import.meta.dirname, "../../src");
    const users: string[] = [];
    for (const file of await sourceFiles(root)) {
      const source = await readFile(file, "utf8");
      if (/(?:=\s*fetch\b|\bfetch\s*\()/u.test(source))
        users.push(path.relative(root, file).split(path.sep).join("/"));
    }
    expect(users).toEqual(["main/assistant-service.ts"]);
    const wiring = await readFile(
      path.join(root, "main", "assistant-wiring.ts"),
      "utf8",
    );
    // Requests run only while the user has the assistant enabled.
    expect(wiring).toMatch(/if \(!settings\.enabled\)/u);
  });

  it("keeps the sole operating-system External Link capability at the validated main-process call site", async () => {
    const root = path.resolve(import.meta.dirname, "../../src");
    const matches: string[] = [];
    for (const file of await sourceFiles(root)) {
      const source = await readFile(file, "utf8");
      if (source.includes("shell.openExternal"))
        matches.push(path.relative(root, file).split(path.sep).join("/"));
    }

    // The assistant opens only its providers' fixed API key pages.
    expect(matches.sort()).toEqual([
      "main/assistant-wiring.ts",
      "main/index.ts",
    ]);
  });
});
