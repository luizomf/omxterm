import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadTerminalSnippets,
  resolveTerminalSnippetsPath,
} from "../../src/main/snippets";

async function roots() {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-snippets-test-"));
  return { xdg: path.join(root, "xdg"), home: path.join(root, "home") };
}

async function writeSnippetsFile(xdg: string, contents: string | Buffer) {
  const file = path.join(xdg, "omxterm", "snippets.json");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
  return file;
}

describe("Snippets file loading", () => {
  it("resolves next to config.json under the XDG configuration root", () => {
    // path.join keeps the expectation exact on every host separator.
    expect(
      resolveTerminalSnippetsPath({ XDG_CONFIG_HOME: "/xdg" }, "/home/t"),
    ).toBe(path.join("/xdg", "omxterm", "snippets.json"));
    expect(resolveTerminalSnippetsPath({}, "/home/t")).toBe(
      path.join("/home/t", ".config", "omxterm", "snippets.json"),
    );
  });

  it("treats a missing file as the clean empty state without an error", async () => {
    const { xdg, home } = await roots();
    const load = await loadTerminalSnippets({
      environment: { XDG_CONFIG_HOME: xdg },
      homeDirectory: home,
    });
    expect(load).toEqual({ snippets: [] });
  });

  it("loads valid snippets, defaults execute to false, and never modifies the file", async () => {
    const { xdg, home } = await roots();
    const original = JSON.stringify({
      version: 1,
      snippets: [
        { name: "greet", body: "printf hello", description: "say hello" },
        { name: "update", body: "brew update\nbrew upgrade", execute: true },
      ],
    });
    const file = await writeSnippetsFile(xdg, original);

    const load = await loadTerminalSnippets({
      environment: { XDG_CONFIG_HOME: xdg },
      homeDirectory: home,
    });

    expect(load.error).toBeUndefined();
    expect(load.snippets).toEqual([
      {
        name: "greet",
        body: "printf hello",
        description: "say hello",
        execute: false,
      },
      { name: "update", body: "brew update\nbrew upgrade", execute: true },
    ]);
    expect((await readFile(file)).toString()).toBe(original);
  });

  it.each([
    ["invalid UTF-8", Buffer.from([0xff]), undefined, "not valid UTF-8"],
    ["invalid JSON", "{not json", undefined, "not valid JSON"],
    ["a non-object root", "[]", "$", "must be an object"],
    [
      "an unknown root key",
      '{"version":1,"snippets":[],"x":1}',
      "$.x",
      "is unknown",
    ],
    ["a missing version", '{"snippets":[]}', "version", "is required"],
    ["a wrong version", '{"version":2,"snippets":[]}', "version", "must be 1"],
    ["missing snippets", '{"version":1}', "snippets", "is required"],
    [
      "a non-array snippets",
      '{"version":1,"snippets":{}}',
      "snippets",
      "must be an array",
    ],
    [
      "an unknown snippet key",
      '{"version":1,"snippets":[{"name":"a","body":"b","extra":1}]}',
      "snippets[0].extra",
      "is unknown",
    ],
    [
      "an empty name",
      '{"version":1,"snippets":[{"name":"","body":"b"}]}',
      "snippets[0].name",
      "non-empty string",
    ],
    [
      "a missing body",
      '{"version":1,"snippets":[{"name":"a"},{"name":"b"}]}',
      "snippets[0].body",
      "non-empty string",
    ],
    [
      "a non-boolean execute",
      '{"version":1,"snippets":[{"name":"a","body":"b"},{"name":"c","body":"d","execute":"yes"}]}',
      "snippets[1].execute",
      "must be a boolean",
    ],
  ])(
    "reports %s with the exact location instead of throwing",
    async (_kind, contents, location, reasonFragment) => {
      const { xdg, home } = await roots();
      const file = await writeSnippetsFile(xdg, contents);

      const load = await loadTerminalSnippets({
        environment: { XDG_CONFIG_HOME: xdg },
        homeDirectory: home,
      });

      expect(load.snippets).toEqual([]);
      expect(load.error).toContain(file);
      if (location) expect(load.error).toContain(JSON.stringify(location));
      expect(load.error).toContain(reasonFragment);
      expect(load.error).toContain("reopen the Snippets Sidebar");
    },
  );

  it("keeps diagnostics free of snippet contents", async () => {
    const { xdg, home } = await roots();
    const canary = "SECRET-SNIPPET-CANARY";
    await writeSnippetsFile(
      xdg,
      `{"version":1,"snippets":[{"name":"a","body":"${canary}","execute":"x"}]}`,
    );

    const load = await loadTerminalSnippets({
      environment: { XDG_CONFIG_HOME: xdg },
      homeDirectory: home,
    });

    expect(load.error).toBeDefined();
    expect(load.error).not.toContain(canary);
  });

  it("reports an unreadable file without treating it as absence", async () => {
    const { xdg, home } = await roots();
    const load = await loadTerminalSnippets({
      environment: { XDG_CONFIG_HOME: xdg },
      homeDirectory: home,
      read: (async () => {
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      }) as never,
    });
    expect(load.snippets).toEqual([]);
    expect(load.error).toContain("could not be read");
  });
});
