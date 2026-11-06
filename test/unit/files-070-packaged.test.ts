import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { transform } from "esbuild";
import { pathToFileURL } from "node:url";
import { expect, it, vi } from "vitest";
import {
  assertLinuxFilesScenario,
  linuxFiles070Checks,
} from "../fixtures/files-packaged-linux-options";

it("rejects a previous valid Quit receipt for every new Files0.7 packaged run without altering old evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "files-070-evidence-"));
  try {
    const directory = path.join(root, "evidence");
    await mkdir(directory);
    const inputs = {
      version: "0.25.0-dev.19",
      extensionVersion: "0.7.0",
      extensionName: "Files — ARM64 preview",
      archiveSha256:
        "611886517ee1bd662c8d6bbed2a7673f3b9994ba0d68724be76251427b3c72ef",
    };
    const previous = JSON.stringify({
      ...inputs,
      host: inputs.version,
      approvals: 3,
      checks: [...linuxFiles070Checks],
      joined: true,
      quit: "joined",
      baselineExited: true,
      children: Array.from({ length: 3 }, () => ({
        closed: true,
        exit: { code: 0, signal: null },
      })),
    });
    await writeFile(path.join(directory, "quit.json"), previous);
    const source = await readFile(
      "test/integration/files-packaged.test.ts",
      "utf8",
    );
    // Exercise the actual evidence allocator and Quit verifier with real files,
    // without loading or launching Electron.
    const functions = [
      ["async function prepareEvidence(", "async function prepareObserver("],
      [
        "async function verifyPublicQuit(",
        "async function captureListingFailure(",
      ],
    ]
      .map(([start, end]) => {
        const first = source.indexOf(start!);
        const last = source.indexOf(end!, first);
        expect(first).toBeGreaterThan(0);
        expect(last).toBeGreaterThan(first);
        return source.slice(first, last);
      })
      .join("\n");
    const compiled = await transform(functions, { loader: "ts" });
    const load = new Function(
      "process",
      "path",
      "mkdir",
      "mkdtemp",
      "readFile",
      "assert",
      "assertLinuxFilesScenario",
      "inputs",
      "linuxPublicCatalog",
      "consumer070",
      compiled.code + "\nreturn { prepareEvidence, verifyPublicQuit };",
    ) as (...args: unknown[]) => {
      prepareEvidence(root: string): Promise<string>;
      verifyPublicQuit(evidence: string): Promise<void>;
    };
    const fixture = load(
      { env: { OMXTERM_FILES_PACKAGED_EVIDENCE: directory } },
      path,
      mkdir,
      mkdtemp,
      readFile,
      assert,
      assertLinuxFilesScenario,
      inputs,
      false,
      true,
    );
    // Establish that the old receipt really passes the unchanged verifier.
    await fixture.verifyPublicQuit(directory);
    const current = await fixture.prepareEvidence(root);
    await expect(fixture.verifyPublicQuit(current)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(path.dirname(current)).toBe(directory);
    expect(current).not.toBe(directory);
    expect(await readFile(path.join(directory, "quit.json"), "utf8")).toBe(
      previous,
    );
    await writeFile(path.join(current, "quit.json"), previous);
    await fixture.verifyPublicQuit(current);
    const next = await fixture.prepareEvidence(root);
    expect(next).not.toBe(current);
    await expect(fixture.verifyPublicQuit(next)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(path.join(current, "quit.json"), "utf8")).toBe(
      previous,
    );
    expect(await readFile(path.join(directory, "quit.json"), "utf8")).toBe(
      previous,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function setup(size = 23285) {
  const source = await readFile("test/fixtures/files-070-packaged.cjs", "utf8");
  const loadConsumer = vi.fn(async () => ({
    runFiles070Consumer: vi.fn(async () => {
      children[0]!.closed = true;
      children[0]!.exit = { code: 0, signal: null };
      checks.push("shared-consumer-completed");
    }),
  }));
  const children: {
    closed: boolean;
    exit: null | { code: number; signal: null };
  }[] = [{ closed: false, exit: null }];
  const checks: string[] = [];
  const writes = vi.fn();
  let quit: (() => void) | undefined;
  let alive = true;
  const app = {
    getVersion: () => "0.25.0-dev.19",
    getAppPath: () => "/package/app.asar",
    once: (_event: string, callback: () => void) => {
      quit = callback;
    },
  };
  const module = {
    exports: {} as { run(context: unknown): Promise<Record<string, unknown>> },
  };
  const require = (name: string): unknown => {
    if (name === "electron") return { app };
    if (name === "node:assert/strict") return assert;
    if (name === "node:fs/promises")
      return { readFile: async () => Buffer.alloc(size), writeFile: writes };
    if (name === "node:fs") return { writeFileSync: writes };
    if (name === "node:path") return path;
    if (name === "node:url") return { pathToFileURL };
    if (name === "./snippets-process-identity.cjs")
      return { alive: () => alive };
    throw Error(`Unexpected dependency ${name}`);
  };
  // Replace only module loading; execute the adapter's actual assertions,
  // lifecycle ordering and Quit callback with controlled process outcomes.
  expect(source.match(/await import\(/g)).toHaveLength(1);
  const load = new Function(
    "require",
    "module",
    "loadConsumer",
    "globalThis",
    source.replace("await import(", "await loadConsumer("),
  ) as (...args: unknown[]) => void;
  load(require, module, loadConsumer, {
    __omxtermPackagedState: { approvals: 3 },
  });
  const context = {
    options: {
      root: "/fixture",
      archive: "/files.omxext",
      evidence: "/evidence",
      files: "/owned-files",
      extensionVersion: "0.7.0",
      extensionName: "Files — ARM64 preview",
      archiveSha256:
        "611886517ee1bd662c8d6bbed2a7673f3b9994ba0d68724be76251427b3c72ef",
    },
    checks,
    children,
    core: {
      insertText: vi.fn(),
      sendInputEvent: vi.fn(),
      capturePage: async () => ({ toPNG: () => Buffer.from("capture") }),
    },
    hosted: () => [],
    js: async (expression: string) =>
      expression.includes("Math.max") ? 1 : true,
    until: async (check: () => boolean) => {
      assert.ok(check());
    },
    terminal: vi.fn(),
    settings: vi.fn(),
    installArchive: vi.fn(),
    state: async (label: string) => {
      if (label === "generation 5") {
        children[1]!.closed = true;
        children[1]!.exit = { code: 0, signal: null };
      }
    },
    openFiles: async () => {
      children.push({ closed: false, exit: null });
      return { isDestroyed: () => false };
    },
    shell: { probePid: 42 },
    identity: { start: "123" },
    initialShell: { probePid: 42, start: "123" },
    shellStat: () => (alive ? { start: "123", state: "S" } : undefined),
  };
  return {
    context,
    run: module.exports.run,
    loadConsumer,
    writes,
    quit: () => quit!(),
    endShell: () => {
      alive = false;
    },
  };
}

it("adapts the existing consumer, proves dormant reinstall and leaves the third backend active for joined Quit", async () => {
  const fixture = await setup();
  const result = await fixture.run(fixture.context);
  expect(fixture.loadConsumer).toHaveBeenCalledOnce();
  expect(fixture.context.installArchive).toHaveBeenCalledTimes(2);
  expect(fixture.context.children).toHaveLength(3);
  expect(fixture.context.children[2]).toEqual({ closed: false, exit: null });
  expect(result.checks).toContain(
    "reinstall-retirement-dormant-third-consent-active-Files-at-Quit",
  );
  expect(() => fixture.quit()).toThrow("shell kernel exit");
  fixture.endShell();
  expect(() => fixture.quit()).toThrow();
  fixture.context.children[2] = {
    closed: true,
    exit: { code: 0, signal: null },
  };
  fixture.quit();
  const receipt = JSON.parse(
    fixture.writes.mock.calls.at(-1)![1] as string,
  ) as { joined: boolean; baselineExited: boolean };
  expect(receipt).toMatchObject({ joined: true, baselineExited: true });
});

it("rejects wrong-sized bytes before the shared consumer or package operations", async () => {
  const fixture = await setup(23284);
  await expect(fixture.run(fixture.context)).rejects.toThrow();
  expect(fixture.loadConsumer).not.toHaveBeenCalled();
  expect(fixture.context.installArchive).not.toHaveBeenCalled();
});
