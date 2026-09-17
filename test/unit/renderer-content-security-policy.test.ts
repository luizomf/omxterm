import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

function parseDirectives(policy: string): Map<string, readonly string[]> {
  return new Map(
    policy
      .split(";")
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name, ...sources] = directive.split(/\s+/u);
        return [name!, sources] as const;
      }),
  );
}

describe("renderer Content Security Policy", () => {
  it("permits only self-hosted scripts and WebAssembly compilation for Kitty decoding", async () => {
    const html = await readFile(
      path.join(projectRoot, "src", "renderer", "index.html"),
      "utf8",
    );
    const policy = html.match(
      /http-equiv="Content-Security-Policy"\s+content="(?<policy>[^"]+)"/u,
    )?.groups?.policy;

    expect(policy).toBeDefined();
    const directives = parseDirectives(policy!);
    expect(directives.get("script-src")).toEqual([
      "'self'",
      "'wasm-unsafe-eval'",
    ]);
    expect(directives.get("img-src")).toEqual(["blob:"]);
    expect(directives.get("connect-src")).toEqual(["'none'"]);
    expect(directives.get("object-src")).toEqual(["'none'"]);
    expect(directives.get("base-uri")).toEqual(["'none'"]);
    expect(directives.get("script-src")).not.toContain("'unsafe-eval'");
    expect(policy).not.toMatch(/(?:https?:|data:|\*)/u);
  });
});
