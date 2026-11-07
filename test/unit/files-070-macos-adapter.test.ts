import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";

it("public catalog mode uses no local archive and requires active backend, joined Quit and exact install", async () => {
  const source = await readFile(
    "test/fixtures/files-070-macos-adapter.cjs",
    "utf8",
  );
  const actual = createRequire(import.meta.url);
  let quit: (() => void) | undefined;
  const write = vi.fn();
  const localRead = vi.fn(() => {
    throw Error("local archive fallback");
  });
  const app = {
    getVersion: () => "0.25.0",
    once: (_name: string, callback: () => void) => {
      quit = callback;
    },
  };
  const require = (id: string) => {
    if (id === "electron") return { app };
    if (id === "node:fs/promises") return { readFile: localRead };
    if (id === "node:fs") return { writeFileSync: write };
    if (id === "./snippets-process-identity.cjs") return { alive: () => false };
    return actual(id) as unknown;
  };
  const module = {
    exports: {} as { run(context: unknown): Promise<Record<string, unknown>> },
  };
  const load = new Function("require", "module", source) as (
    require: (id: string) => unknown,
    target: {
      exports: { run(context: unknown): Promise<Record<string, unknown>> };
    },
  ) => void;
  load(require, module);
  const globals = globalThis as typeof globalThis & {
    __omxtermPackagedState?: { approvals: number };
  };
  globals.__omxtermPackagedState = { approvals: 1 };
  const child = {
    closed: false,
    exit: null as null | { code: number; signal: null },
  };
  let shellAlive = true;
  const options = {
    filesOnly: true,
    version: "0.25.0",
    extensionVersion: "0.7.0",
    archiveSha256:
      "611886517ee1bd662c8d6bbed2a7673f3b9994ba0d68724be76251427b3c72ef",
    publicCatalog: "fixed",
    evidence: "/scratch",
  };
  const context = {
    options,
    checks: ["exact-archive-trust-dormant-install"],
    children: [child],
    shellStat: () => ({ start: shellAlive ? "same" : "retired" }),
    identity: { start: "same" },
    initialShell: { probePid: 123, start: "same" },
    publicCatalogInstalls: ["Install"],
  };
  try {
    await expect(
      module.exports.run({ ...context, publicCatalogInstalls: [] }),
    ).rejects.toThrow();
    const result = await module.exports.run(context);
    expect(result).toMatchObject({
      publicCatalog: { url: "fixed", installs: ["Install"] },
      catalog: { mode: "public", requests: null, transportClosed: null },
      approvals: 1,
    });
    expect(localRead).not.toHaveBeenCalled();
    expect(quit).toBeDefined();
    expect(() => quit!()).toThrow();
    child.closed = true;
    child.exit = { code: 0, signal: null };
    shellAlive = false;
    quit!();
    expect(JSON.parse(write.mock.calls[0]![1] as string)).toMatchObject({
      joined: true,
      baselineExited: true,
    });
  } finally {
    delete globals.__omxtermPackagedState;
  }
});
