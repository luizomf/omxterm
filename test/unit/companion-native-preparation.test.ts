import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { expect, it } from "vitest";

it.each([
  "valid",
  "A-destroyed",
  "automatic-successor",
  "A-detached",
  "duplicate-view",
  "wrong-survivor",
  "B-still-listed",
  "backend-replaced",
  "backend-exited",
])("combined close oracle rejects %s", async (fault) => {
  const source = await readFile("test/fixtures/companion-combined.cjs", "utf8");
  const start = source.indexOf("  assert.equal(a.isDestroyed(), false);");
  const end = source.indexOf("  // No successor", start);
  const visibleStart = source.indexOf("  async function visible(");
  const visibleEnd = source.indexOf("  async function openTool(", visibleStart);
  const backendStart = source.indexOf("  const assertBackends = () =>");
  const backendEnd = source.indexOf("  await visible(a, false);", backendStart);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const a = { isDestroyed: () => fault === "A-destroyed" };
  const children = [
    { closed: true, exit: { code: 0 } },
    { closed: false, exit: null },
    { closed: false, exit: null },
  ];
  const backendSnapshot = [...children];
  if (fault === "backend-replaced")
    children.push({ closed: false, exit: null });
  if (fault === "backend-exited") children[1]!.closed = true;
  const environment = {
    assert,
    a,
    children,
    backendSnapshot,
    native: () =>
      fault === "A-detached"
        ? undefined
        : { getVisible: () => fault === "automatic-successor" },
    hosted: () =>
      fault === "duplicate-view"
        ? [a, {}]
        : fault === "wrong-survivor"
          ? [{}]
          : [a],
    js: async () => fault !== "B-still-listed",
    until: async (check: () => boolean) => {
      assert.equal(await check(), true);
    },
  };
  const run = new Function(
    ...Object.keys(environment),
    `return (async () => { ${source.slice(visibleStart, visibleEnd)} ${source.slice(backendStart, backendEnd)} ${source.slice(start, end)} })();`,
  ) as (...args: unknown[]) => Promise<void>;
  if (fault === "valid")
    await expect(run(...Object.values(environment))).resolves.toBeUndefined();
  else await expect(run(...Object.values(environment))).rejects.toThrow();
});

it("combined Files readiness uses the archive manifest display name", async () => {
  const manifest = JSON.parse(
    await readFile("extensions/files/extension.json", "utf8"),
  ) as { name: string; version: string };
  const source = await readFile("test/fixtures/companion-combined.cjs", "utf8");
  const expression = source.match(
    /`(!!\[\.\.\.document\.querySelectorAll\('\.extensions-panel section h3'\)[\s\S]*?)`/u,
  )?.[1];
  expect(expression).toBeDefined();
  const title = `${manifest.name} · ${manifest.version}`;
  const createScript = new Function(
    "options",
    `return \`${expression}\`;`,
  ) as (options: { filesTitle: string }) => string;
  const script = createScript({ filesTitle: title });
  const ready = new Function("document", `return ${script};`) as (
    document: unknown,
  ) => boolean;
  expect(ready({ querySelectorAll: () => [{ textContent: title }] })).toBe(
    true,
  );
  expect(
    ready({ querySelectorAll: () => [{ textContent: "Files · 0.5.0" }] }),
  ).toBe(false);
  expect(ready({ querySelectorAll: () => [] })).toBe(false);
});

const require = createRequire(import.meta.url);
const { assertGesture, assertInputReceipt } =
  require("../fixtures/companion-native-input.cjs") as {
    assertGesture: (events: unknown[], key: string, target: string) => void;
    assertInputReceipt: (before: string, actual: string, key: string) => void;
  };
it.each(["Escape", "Enter"])(
  "%s exact raw-client fence rejects leaks and swallowed fresh input",
  (key) => {
    const fresh = key === "Enter" ? "\r" : "\u001b";
    expect(() =>
      assertInputReceipt("prior", "prior" + fresh + "x", key),
    ).not.toThrow();
    for (const actual of [
      "priorx",
      "prior" + fresh + fresh + "x",
      "prior" + fresh,
      "other" + fresh + "x",
    ])
      expect(() => assertInputReceipt("prior", actual, key)).toThrow();
  },
);
for (const [key, target] of [
  ["Escape", "child"],
  ["Enter", "core"],
]) {
  it.each([
    "valid",
    "missing-initial",
    "wrong-owner",
    "missing-repeat",
    "unprevented-repeat",
    "unprevented-release",
  ])(`${target} ${key} native gesture rejects %s`, (fault) => {
    const events = [
      {
        target: fault === "wrong-owner" ? "other" : target,
        key,
        type: "keyDown",
        repeat: false,
        prevented: true,
      },
      {
        target: "core",
        key,
        type: "keyDown",
        repeat: true,
        prevented: fault !== "unprevented-repeat",
      },
      {
        target: "core",
        key,
        type: "keyUp",
        repeat: false,
        prevented: fault !== "unprevented-release",
      },
    ];
    if (fault === "missing-initial") events.shift();
    if (fault === "missing-repeat") events.splice(1, 1);
    const run = () => assertGesture(events, key!, target!);
    if (
      fault === "valid" ||
      (target === "core" && fault.startsWith("unprevented"))
    )
      expect(run).not.toThrow();
    else expect(run).toThrow();
  });
}

it.each([
  "valid-source",
  "valid-package",
  "packaged-lie",
  "wrong-app-path",
  "wrong-executable",
  "wrong-argv",
  "wrong-version",
  "changed-entry",
  "changed-runtime",
  "changed-executable",
  "wrong-main",
  "missing-hash",
])("SSH admission validates actual identity: %s", async (fault) => {
  const source = await readFile("test/fixtures/ssh-packaged.cjs", "utf8");
  const block = source.slice(
    source.indexOf("function inspect(options)"),
    source.indexOf("function identity(pid)"),
  );
  const sourceRoot = "/fixture/source";
  const executable = path.join(
    sourceRoot,
    "node_modules/electron/dist/electron",
  );
  const hash = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const files: Record<string, string> = {
    "package.json": JSON.stringify({
      main: fault === "wrong-main" ? "fake.js" : "dist/main/index.js",
    }),
    "dist/main/index.js": "production entry",
    "dist/extension-runtime/bootstrap.mjs": "production runtime",
  };
  const options = {
    source: fault === "valid-package" ? undefined : sourceRoot,
    asar: sourceRoot,
    executable,
    version: "0.1.0",
    executableSha256: hash("electron"),
    sourceHashes: Object.fromEntries(
      Object.entries(files).map(([name, bytes]) => [name, hash(bytes)]),
    ),
  };
  if (fault === "changed-entry") files["dist/main/index.js"] = "changed";
  if (fault === "changed-runtime")
    files["dist/extension-runtime/bootstrap.mjs"] = "changed";
  if (fault === "missing-hash")
    delete options.sourceHashes["dist/main/index.js"];
  const environment = {
    app: {
      isPackaged: fault === "packaged-lie" || fault === "valid-package",
      getVersion: () => (fault === "wrong-version" ? "other" : "0.1.0"),
      getAppPath: () => (fault === "wrong-app-path" ? "/other" : sourceRoot),
    },
    process: {
      argv: [executable, fault === "wrong-argv" ? "/other" : sourceRoot],
      execPath: fault === "wrong-executable" ? "/other" : executable,
    },
    fs: {
      realpathSync: (name: string) => name,
      readFileSync: (name: string) =>
        name === executable
          ? fault === "changed-executable"
            ? "changed"
            : "electron"
          : files[path.relative(sourceRoot, name)],
    },
    path,
    assert,
    require,
  };
  const createInspect = new Function(
    ...Object.keys(environment),
    `${block}; return inspect;`,
  ) as (...args: unknown[]) => (options: unknown) => { packaged: boolean };
  const inspect = createInspect(...Object.values(environment));
  if (fault.startsWith("valid"))
    expect(inspect(options).packaged).toBe(fault === "valid-package");
  else expect(() => inspect(options)).toThrow();
});
