import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import {
  loadTerminalSnippets,
  resolveTerminalSnippetsPath,
} from "../../src/main/snippets";

async function roots() {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-snippets-test-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  return { xdg: path.join(root, "xdg"), home: path.join(root, "home") };
}

async function writeSnippetsFile(xdg: string, contents: string | Buffer) {
  const file = path.join(xdg, "omxterm", "snippets.yaml");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
  return file;
}

describe("Snippets file loading", () => {
  it("loads YAML literal blocks without changing shell quotes or line breaks", async () => {
    const { xdg, home } = await roots();
    const file = path.join(xdg, "omxterm", "snippets.yaml");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      `version: 1
snippets:
  - name: Print a message
    body: |-
      printf '%s\\n' "Hello"
      echo done
`,
    );
    expect(
      await loadTerminalSnippets({
        environment: { XDG_CONFIG_HOME: xdg },
        homeDirectory: home,
      }),
    ).toEqual({
      snippets: [
        {
          name: "Print a message",
          body: "printf '%s\\n' \"Hello\"\necho done",
          execute: false,
        },
      ],
    });
  });
  it("resolves next to config.json under the XDG configuration root", () => {
    // path.join keeps the expectation exact on every host separator.
    expect(
      resolveTerminalSnippetsPath({ XDG_CONFIG_HOME: "/xdg" }, "/home/t"),
    ).toBe(path.join("/xdg", "omxterm", "snippets.yaml"));
    expect(resolveTerminalSnippetsPath({}, "/home/t")).toBe(
      path.join("/home/t", ".config", "omxterm", "snippets.yaml"),
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
    ["invalid YAML", "{not yaml", undefined, "not valid YAML"],
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
});

describe("Snippets YAML parsing", () => {
  it.each([
    [
      "local tag",
      "version: 1\nsnippets: !secret []",
      "unsupported YAML tag or directive",
    ],
    [
      "non-core standard tag",
      "version: 1\nsnippets: !!set {}",
      "unsupported YAML tag or directive",
    ],
    [
      "YAML 1.1",
      "%YAML 1.1\n---\nversion: 1\nsnippets: []",
      "YAML version must be 1.2",
    ],
    [
      "duplicate key",
      "version: 1\nversion: 1\nsnippets: []",
      "duplicate mapping keys",
    ],
    [
      "multiple documents",
      "version: 1\nsnippets: []\n---\nversion: 1\nsnippets: []",
      "exactly one YAML document",
    ],
  ])(
    "rejects %s with a content-free diagnostic",
    async (_kind, text, reason) => {
      const { xdg, home } = await roots();
      await writeSnippetsFile(xdg, text);
      const load = await loadTerminalSnippets({
        environment: { XDG_CONFIG_HOME: xdg },
        homeDirectory: home,
      });
      expect(load.snippets).toEqual([]);
      expect(load.error).toContain(reason);
      expect(load.error).not.toContain("secret");
    },
  );

  it("rejects aliases rather than expanding them", async () => {
    const { xdg, home } = await roots();
    await writeSnippetsFile(
      xdg,
      "version: 1\nsnippets:\n  - name: &label hello\n    body: *label\n",
    );
    const load = await loadTerminalSnippets({
      environment: { XDG_CONFIG_HOME: xdg },
      homeDirectory: home,
    });
    expect(load.snippets).toEqual([]);
    expect(load.error).toContain("aliases are not supported");
  });

  it.each([
    [
      "depth",
      `version: 1\nsnippets: ${"[".repeat(16)}0${"]".repeat(16)}`,
      "maximum collection depth is 16",
    ],
    [
      "items",
      `version: 1\nsnippets: [${Array(4095).fill("0").join(",")}]`,
      "at most 4096 collection items",
    ],
  ])(
    "rejects YAML exceeding the %s budget before schema conversion",
    async (_kind, text, reason) => {
      const { xdg, home } = await roots();
      await writeSnippetsFile(xdg, text);
      const load = await loadTerminalSnippets({
        environment: { XDG_CONFIG_HOME: xdg },
        homeDirectory: home,
      });
      expect(load.snippets).toEqual([]);
      expect(load.error).toContain(reason);
    },
  );

  it("rejects files above 1 MiB before decoding", async () => {
    const { xdg, home } = await roots();
    await writeSnippetsFile(
      xdg,
      `version: 1\nsnippets: []\n#${"x".repeat(1_048_576)}`,
    );
    const load = await loadTerminalSnippets({
      environment: { XDG_CONFIG_HOME: xdg },
      homeDirectory: home,
    });
    expect(load.snippets).toEqual([]);
    expect(load.error).toContain("at most 1048576 bytes");
  });

  it.each([
    ["|-", "echo one\necho two"],
    ["|", "echo one\necho two\n"],
    ["|+", "echo one\necho two\n\n"],
  ])("preserves literal block chomping %s", async (style, body) => {
    const { xdg, home } = await roots();
    await writeSnippetsFile(
      xdg,
      `version: 1\nsnippets:\n  - name: lines\n    body: ${style}\n      echo one\n      echo two\n\n`,
    );
    expect(
      (
        await loadTerminalSnippets({
          environment: { XDG_CONFIG_HOME: xdg },
          homeDirectory: home,
        })
      ).snippets,
    ).toEqual([{ name: "lines", body, execute: false }]);
  });

  it("loads one-line YAML with YAML 1.2 core scalar types", async () => {
    const { xdg, home } = await roots();
    await writeSnippetsFile(
      xdg,
      "version: 1\nsnippets:\n  - name: yes\n    body: on\n    description: 2026-01-01\n    execute: true\n",
    );
    expect(
      (
        await loadTerminalSnippets({
          environment: { XDG_CONFIG_HOME: xdg },
          homeDirectory: home,
        })
      ).snippets,
    ).toEqual([
      { name: "yes", body: "on", description: "2026-01-01", execute: true },
    ]);
  });

  it("accepts exactly 1 MiB of UTF-8 source", async () => {
    const { xdg, home } = await roots();
    const prefix = "version: 1\nsnippets: []\n#";
    await writeSnippetsFile(
      xdg,
      prefix + "x".repeat(1_048_576 - Buffer.byteLength(prefix)),
    );
    expect(
      await loadTerminalSnippets({
        environment: { XDG_CONFIG_HOME: xdg },
        homeDirectory: home,
      }),
    ).toEqual({ snippets: [] });
  });

  it.each([
    [
      "depth boundary",
      `version: 1\nsnippets: ${"[".repeat(15)}0${"]".repeat(15)}`,
      "must be an object",
    ],
    [
      "item boundary",
      `version: 1\nsnippets: [${Array(4094).fill("0").join(",")}]`,
      "at most 512 snippets",
    ],
    [
      "implicit flow mapping depth overflow",
      "version: 1\nsnippets: " + "[a: ".repeat(8) + "0" + "]".repeat(8),
      "maximum collection depth is 16",
    ],
    [
      "implicit flow mapping depth boundary",
      "version: 1\nsnippets: " + "[a: ".repeat(7) + "[0]" + "]".repeat(7),
      "is unknown",
    ],
    [
      "implicit flow mapping item overflow",
      "version: 1\nsnippets: [" + Array(2048).fill("a: 0").join(", ") + "]",
      "at most 4096 collection items",
    ],
    [
      "implicit flow mapping item boundary",
      "version: 1\nsnippets: [" + Array(2047).fill("a: 0").join(", ") + "]",
      "at most 512 snippets",
    ],
    [
      "explicit flow pair item overflow",
      "version: 1\nsnippets: [" + Array(2048).fill("? a").join(", ") + "]",
      "at most 4096 collection items",
    ],
    [
      "deep flow input",
      "[".repeat(10_000) + "0" + "]".repeat(10_000),
      "maximum collection depth is 16",
    ],
    [
      "deep block input",
      Array.from({ length: 100 }, (_, i) => `${"  ".repeat(i)}a:`).join("\n"),
      "maximum collection depth is 16",
    ],
    [
      "complex mapping key",
      "version: 1\nsnippets:\n  - ? [name]\n    : hello\n    body: world",
      "not valid YAML",
    ],
    [
      "nested duplicate",
      "version: 1\nsnippets: [{name: a, body: b, body: c}]",
      "duplicate mapping keys",
    ],
    [
      "merge key",
      "version: 1\nsnippets: [{name: a, body: b, <<: {execute: true}}]",
      "is unknown",
    ],
    [
      "scalar tag",
      "version: 1\nsnippets: [{name: a, body: !secret b}]",
      "unsupported YAML tag",
    ],
    [
      "extra empty document",
      "version: 1\nsnippets: []\n---\n",
      "exactly one YAML document",
    ],
    ["empty document", "# empty\n", "must be an object"],
  ])("handles %s without exposing source text", async (_kind, text, reason) => {
    const { xdg, home } = await roots();
    await writeSnippetsFile(xdg, text);
    const load = await loadTerminalSnippets({
      environment: { XDG_CONFIG_HOME: xdg },
      homeDirectory: home,
    });
    expect(load.snippets).toEqual([]);
    expect(load.error).toContain(reason);
    expect(load.error).not.toContain("secret");
  });
});

describe("Snippets schema boundaries and diagnostics", () => {
  it.each([
    ["name", "a".repeat(129), "128 characters"],
    ["body", "a".repeat(65_537), "65536 characters"],
    ["description", "a".repeat(513), "512 characters"],
    ["name", 1, "non-empty string"],
    ["body", true, "non-empty string"],
    ["description", null, "must be a string"],
    ["execute", null, "must be a boolean"],
  ])("rejects invalid %s schema values", async (field, value, reason) => {
    const { xdg, home } = await roots();
    await writeSnippetsFile(
      xdg,
      JSON.stringify({
        version: 1,
        snippets: [{ name: "a", body: "b", [field]: value }],
      }),
    );
    const load = await loadTerminalSnippets({
      environment: { XDG_CONFIG_HOME: xdg },
      homeDirectory: home,
    });
    expect(load.snippets).toEqual([]);
    expect(load.error).toContain(`snippets[0].${field}`);
    expect(load.error).toContain(reason);
  });

  it("accepts schema length boundaries and rejects 513 snippets", async () => {
    const { xdg, home } = await roots();
    const snippet = {
      name: "a".repeat(128),
      body: "b".repeat(65_536),
      description: "c".repeat(512),
      execute: false,
    };
    await writeSnippetsFile(
      xdg,
      JSON.stringify({ version: 1, snippets: [snippet] }),
    );
    expect(
      (
        await loadTerminalSnippets({
          environment: { XDG_CONFIG_HOME: xdg },
          homeDirectory: home,
        })
      ).snippets,
    ).toEqual([snippet]);
    const entries = Array.from({ length: 512 }, () => ({
      name: "a",
      body: "b",
    }));
    await writeSnippetsFile(
      xdg,
      JSON.stringify({ version: 1, snippets: entries }),
    );
    expect(
      (
        await loadTerminalSnippets({
          environment: { XDG_CONFIG_HOME: xdg },
          homeDirectory: home,
        })
      ).snippets,
    ).toHaveLength(512);
    await writeSnippetsFile(
      xdg,
      JSON.stringify({ version: 1, snippets: [...entries, entries[0]] }),
    );
    expect(
      (
        await loadTerminalSnippets({
          environment: { XDG_CONFIG_HOME: xdg },
          homeDirectory: home,
        })
      ).error,
    ).toContain("at most 512 snippets");
  });

  it("reports YAML syntax coordinates without parser excerpts", async () => {
    const { xdg, home } = await roots();
    await writeSnippetsFile(xdg, "version: 1\nsnippets: [SECRET-CANARY");
    const load = await loadTerminalSnippets({
      environment: { XDG_CONFIG_HOME: xdg },
      homeDirectory: home,
    });
    expect(load.error).toContain("line 2, column 25");
    expect(load.error).not.toContain("SECRET-CANARY");
  });

  it("does not read or migrate the old JSON filename", async () => {
    const { xdg, home } = await roots();
    const directory = path.join(xdg, "omxterm");
    await mkdir(directory, { recursive: true });
    const oldPath = path.join(directory, "snippets.json");
    const original = '{"version":1,"snippets":[{"name":"old","body":"old"}]}';
    await writeFile(oldPath, original);
    expect(
      await loadTerminalSnippets({
        environment: { XDG_CONFIG_HOME: xdg },
        homeDirectory: home,
      }),
    ).toEqual({ snippets: [] });
    expect(await readFile(oldPath, "utf8")).toBe(original);
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
