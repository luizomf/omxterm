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
  it("allows only the explicit main-owned HTTPS installer and packaged view origin, not general application networking", async () => {
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
      let source = await readFile(file, "utf8");
      if (
        path.relative(root, file).split(path.sep).join("/") ===
        "main/extension-download.ts"
      ) {
        // Exact transport/type imports only; behavioral tests cover bounded TLS,
        // redirects, response bytes and cancellation. Other capabilities stay forbidden.
        for (const allowed of [
          'import { request } from "node:https";',
          'import type { IncomingMessage } from "node:http";',
        ]) {
          expect(source.split(allowed)).toHaveLength(2);
          source = source.replace(allowed, "");
        }
      }
      if (
        path.relative(root, file).split(path.sep).join("/") ===
        "main/ssh-terminal-launch.ts"
      ) {
        // Pure address validation exposes no socket or network transport.
        const validationImport = 'import { isIP } from "node:net";';
        expect(source.split(validationImport)).toHaveLength(2);
        source = source.replace(validationImport, "");
      }
      if (
        ["main/agent-endpoint.ts", "agent-ctl/client.ts"].includes(
          path.relative(root, file).split(path.sep).join("/"),
        )
      ) {
        // The agent API's user-only Unix socket (ADR 0052): a path, never a
        // port; agent-endpoint tests cover the boundary.
        const socketImport = 'import net from "node:net";';
        expect(source.split(socketImport)).toHaveLength(2);
        source = source.replace(socketImport, "");
      }
      if (
        path.relative(root, file).split(path.sep).join("/") ===
        "main/extension-view-host.ts"
      ) {
        // One explicit custom-origin load, constrained by the host/resource
        // behavior tests. No exception for fetch/download or any other caller.
        const ownedLoad = "current.contents.loadURL(current.entryUrl)";
        expect(source.split(ownedLoad)).toHaveLength(2);
        source = source.replace(ownedLoad, "ownedPackagedResourceLoad");
      }
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
