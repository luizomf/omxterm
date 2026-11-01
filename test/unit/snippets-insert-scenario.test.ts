/* eslint-disable max-lines, max-lines-per-function -- Keep the simulated Windows scenario and its input assertions together. */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import type { InsertDiagnosticSnapshot } from "../fixtures/snippets-insert-diagnostic.cjs";

const require = createRequire(import.meta.url);
const { startInsertDiagnostic } =
  require("../fixtures/snippets-insert-diagnostic.cjs") as typeof import("../fixtures/snippets-insert-diagnostic.cjs");
const { createWindowsCprTrace } =
  require("../fixtures/snippets-windows-cpr.cjs") as {
    createWindowsCprTrace(): {
      output(text: string): void;
      write(index: number, text: string): void;
      snapshot(): unknown;
    };
  };
const source = await readFile("test/fixtures/snippets-scenario.cjs", "utf8");
const catalog: unknown = JSON.parse(
  await readFile("test/fixtures/snippets-windows-catalog.json", "utf8"),
);

type NativeKeyListener = (
  event: { defaultPrevented: boolean },
  input: { type: string; key: string; code: string; isAutoRepeat: boolean },
) => void;

type PseudoView = {
  id: number;
  visible: boolean;
  destroyed: boolean;
  ipc: {
    handle(channel: string, handler: (...args: unknown[]) => unknown): void;
  };
  invoke: (...args: unknown[]) => unknown;
  on(name: string, listener: NativeKeyListener): void;
  once(name: string, callback: () => void): void;
  isDestroyed(): boolean;
  isFocused(): boolean;
  getURL(): string;
  capturePage(): Promise<{ toPNG(): Buffer }>;
  executeJavaScript(code: string): Promise<unknown>;
};

async function readDiagnosticArtifacts(root: string) {
  const text = await readFile(
    path.join(root, "evidence", "insert-diagnostic.json"),
    "utf8",
  ).catch(() => undefined);
  const file =
    text === undefined
      ? undefined
      : (JSON.parse(text) as InsertDiagnosticSnapshot & {
          error: string;
          clickDispatched: boolean;
          childInputCheckpointError?: string;
          focusAfter: { view: boolean | null };
        });
  const readinessText = await readFile(
    path.join(root, "evidence", "readiness-diagnostic.json"),
    "utf8",
  ).catch(() => undefined);
  const readiness =
    readinessText === undefined
      ? undefined
      : (JSON.parse(readinessText) as {
          classification: string;
          error: string;
          ptyIdentity: { pid: number } | null;
          snapshotError?: string;
        });
  const writesText = await readFile(
    path.join(root, "evidence", "pty-writes.json"),
    "utf8",
  ).catch(() => undefined);
  const ptyWrites = writesText
    ? (JSON.parse(writesText) as {
        writes: string[];
        checks: Array<{ expected: string; nonFocus: string; focus: object[] }>;
        childInputCheckpointError?: string;
        childInputCheckpointSidecarError?: string;
        childOutput: {
          text: string;
          truncated: boolean;
          limitCodeUnits: number;
        };
      })
    : undefined;
  const checkpointText = await readFile(
    path.join(root, "evidence", "child-input-checkpoint.json"),
    "utf8",
  ).catch(() => undefined);
  const checkpoint = checkpointText
    ? (JSON.parse(checkpointText) as {
        phase: string;
        pid: number;
        writeOffset: number;
      })
    : undefined;
  const checkpointErrorText = await readFile(
    path.join(root, "evidence", "child-input-checkpoint-error.json"),
    "utf8",
  ).catch(() => undefined);
  const checkpointError = checkpointErrorText
    ? (JSON.parse(checkpointErrorText) as {
        phase: string;
        error: string;
        classification?: string;
      })
    : undefined;
  return { file, readiness, ptyWrites, checkpoint, checkpointError };
}

async function prepareScenarioRoot(existing: boolean) {
  const root = await mkdtemp(path.join(os.tmpdir(), "snippets-first-insert-"));
  await mkdir(path.join(root, "config", "omxterm"), { recursive: true });
  await mkdir(path.join(root, "evidence"));
  if (existing)
    await writeFile(
      path.join(root, "evidence", "readiness-diagnostic.json"),
      JSON.stringify({
        classification: "existing",
        error: "preserve",
        ptyIdentity: null,
      }),
    );
  await writeFile(
    path.join(root, "config", "omxterm", "snippets.yaml"),
    JSON.stringify(catalog),
  );
  return root;
}

async function simulatedScenario(
  writes: string[],
  diagnosticEnabled: boolean,
  options: {
    otherWrites?: string[];
    failFailureCapture?: boolean;
    failDiagnosticFocus?: boolean;
    suppressProbeReceipt?: boolean;
    windowsProbeReady?: boolean;
    readinessDiagnostic?: boolean;
    failReadinessSnapshot?: boolean;
    existingReadinessArtifact?: boolean;
    existingPtyArtifact?: boolean;
    existingChildCheckpoint?: boolean;
    existingCheckpointErrorSidecar?: boolean;
    childInputCapture?: boolean;
    memoryInput?: boolean;
    cprObservation?: boolean;
    delayedWrites?: string[];
    delayedEnterWrites?: string[];
    stopAfterFirstEnter?: boolean;
    stopAfterRun?: boolean;
    enterWrites?: string[];
    enterReceiptPrefix?: string;
    enterReceiptCopies?: number;
    runWrites?: string[];
    delayedRunWrites?: string[];
    suppressRunReceipt?: boolean;
    runReceiptPrefix?: string;
    runDraftPrefix?: string;
    outputTruncated?: boolean;
    probeReceipt?: boolean;
    observedOutput?: string;
    laterOutputChunks?: string[];
  } = {},
) {
  const root = await prepareScenarioRoot(
    options.existingReadinessArtifact === true,
  );
  if (options.existingPtyArtifact)
    await writeFile(
      path.join(root, "evidence", "pty-writes.json"),
      JSON.stringify({ writes: ["prior"], checks: [] }),
    );
  if (options.existingChildCheckpoint)
    await writeFile(
      path.join(root, "evidence", "child-input-checkpoint.json"),
      JSON.stringify({ phase: "prior", pid: 999, writeOffset: 999 }),
    );
  if (options.existingCheckpointErrorSidecar)
    await writeFile(
      path.join(root, "evidence", "child-input-checkpoint-error.json"),
      JSON.stringify({ phase: "prior", error: "preserve" }),
    );
  const app = new EventEmitter();
  const ipcMain = new EventEmitter();
  const pty = {
    pid: 42,
    writes: [] as string[],
    output: "\u001b[?1004l\u001b[?2004lSNIPPETS_SHELL_READY\r\n",
    outputTruncated: options.outputTruncated === true,
    outputLimitCodeUnits: 65536,
    exited: false,
  };
  if (options.cprObservation)
    Object.assign(pty, {
      cprTrace: {
        snapshot() {
          // Synthetic callback order for this harness, not a historical clock.
          const tracker = createWindowsCprTrace();
          tracker.output(pty.output);
          pty.writes.forEach((data, index) => tracker.write(index, data));
          return tracker.snapshot();
        },
      },
    });
  const ptys = [pty];
  const children: { pid: number; closed: boolean; exit: null }[] = [];
  const diagnostic = diagnosticEnabled
    ? startInsertDiagnostic({ app, ipcMain, ptys })
    : undefined;
  let view: PseudoView | undefined;
  let focusCore = true;
  let closeListener: (() => void) | undefined;
  let sequence = 0;
  const enterCalls: unknown[] = [];
  let coreCaptures = 0;
  let frameBarriers = 0;
  let barriersAtClick = 0;
  let clickObserved = false;
  let checkpointAtClick = false;
  const laterOutputChunks = [...(options.laterOutputChunks ?? [])];
  let menuCalls = 0;
  let enterLeakInjected = false;
  let runLeakInjected = false;
  let runStarted = false;
  let coreInput: NativeKeyListener = () => {};
  let childInput: NativeKeyListener = () => {};
  let inputDowns = 0;
  let native: {
    webContents: PseudoView;
    getVisible(): boolean;
    getBounds(): { width: number };
  };
  const window = {
    focus() {},
    isFocused: () => true,
    getNativeWindowHandle: () => Buffer.alloc(8),
    contentView: { children: [] as unknown[] },
    webContents: {
      id: 10,
      on(name: string, listener: NativeKeyListener) {
        if (name === "before-input-event") coreInput = listener;
      },
      isFocused: () => focusCore,
      sendInputEvent(event: unknown) {
        enterCalls.push(event);
        if (options.stopAfterFirstEnter || options.stopAfterRun) {
          if ((event as { type: string }).type === "keyDown") {
            pty.writes.push(...(options.enterWrites ?? ["\r"]));
            pty.output +=
              `${options.enterReceiptPrefix ?? ""}SNIPPETS_INSERT_RECEIPT\r\n`.repeat(
                options.enterReceiptCopies ?? 1,
              );
          }
          return;
        }
        throw new Error("TEST_EXPLICIT_ENTER");
      },
      async capturePage() {
        coreCaptures++;
        if (options.failFailureCapture && coreCaptures > 1)
          throw new Error("capture unavailable");
        return { toPNG: () => Buffer.from("synthetic") };
      },
      async executeJavaScript(code: string) {
        if (code.includes("requestAnimationFrame(() => requestAnimationFrame"))
          frameBarriers++;
        if (code.includes(".auxiliary-close")) closeView();
        if (code.includes(".auxiliary-hide")) hideView();
        if (code.includes(".snippets-view').length")) return 0;
        return true;
      },
    },
  };
  function hideView() {
    if (view) view.visible = false;
    focusCore = true;
  }
  function closeView() {
    if (!view) return;
    view.visible = false;
    view.destroyed = true;
    focusCore = true;
    window.contentView.children = [];
    closeListener?.();
    closeListener = undefined;
  }
  function openView() {
    sequence++;
    let handler: (...args: unknown[]) => unknown = () => undefined;
    const child: PseudoView = {
      id: 100 + sequence,
      visible: true,
      destroyed: false,
      ipc: {
        handle(_channel, next) {
          handler = next;
        },
      },
      invoke: (...args) => handler(...args),
      on(name, listener) {
        if (name === "before-input-event") childInput = listener;
      },
      once(_name, callback) {
        closeListener = callback;
      },
      isDestroyed() {
        return this.destroyed;
      },
      isFocused() {
        if (options.failDiagnosticFocus && clickObserved)
          throw new Error("view focus unavailable");
        return this.visible && !focusCore;
      },
      getURL() {
        return "omx-extension://fixture/index.html";
      },
      async capturePage() {
        return { toPNG: () => Buffer.from("synthetic") };
      },
      async executeJavaScript(code) {
        if (code.includes("document.documentElement.lang")) return "en-US";
        if (
          options.stopAfterFirstEnter &&
          code.includes("li:last-child .snippet-activate')")
        )
          throw Error("TEST_AFTER_FIRST_ENTER");
        if (
          options.stopAfterRun &&
          code.includes("li:last-child .snippet-preview-open")
        )
          throw Error("TEST_AFTER_RUN");
        if (options.stopAfterRun && code === "window.__activationEvents")
          return [{ type: "click", trusted: true }];
        if (code.includes("li:first-child .snippet-activate")) {
          const request = this.invoke(
            { sender: { id: this.id } },
            {
              operation: "terminal.semanticInput.v1",
              text: "  SNIPPETS_INSERT  ",
              intent: "insert",
              preview: false,
            },
          );
          ipcMain.emit(
            "terminal:semantic-reply",
            { sender: { id: 10 } },
            { kind: "started" },
          );
          clickObserved = true;
          checkpointAtClick = existsSync(
            path.join(root, "evidence", "child-input-checkpoint.json"),
          );
          barriersAtClick = frameBarriers;
          pty.writes.push(...writes);
          if (
            !options.suppressProbeReceipt &&
            (options.probeReceipt === true ||
              writes.join("") === "  SNIPPETS_INSERT  ")
          ) {
            if (options.observedOutput !== undefined)
              pty.output = options.observedOutput;
            else {
              pty.output += "SNIPPETS_INSERT_DRAFT_RECEIPT\r\n";
              if (diagnosticEnabled)
                pty.output += "SNIPPETS_DIAGNOSTIC_INSERT_RECEIVED\r\n";
            }
          }
          if (options.otherWrites)
            ptys.push({
              pid: 77,
              writes: options.otherWrites,
              output: "other",
              outputTruncated: false,
              outputLimitCodeUnits: 65536,
              exited: false,
            });
          focusCore = true;
          await request;
        }
        return true;
      },
    };
    app.emit("web-contents-created", {}, child);
    child.ipc.handle("extension-view:request", async () => ({ ok: true }));
    view = child;
    focusCore = false;
    native = {
      webContents: child,
      getVisible: () => child.visible,
      getBounds: () => ({ width: 300 }),
    };
    window.contentView.children = [native];
    if (!children.length)
      children.push({ pid: 1000, closed: false, exit: null });
  }
  let firstToggle = true;
  const menu = {
    getApplicationMenu: () => ({
      items: [
        {
          label: "Toggle Snippets",
          click() {
            menuCalls++;
            if (firstToggle) firstToggle = false;
            else if (!view || view.destroyed) openView();
            else if (!view.visible) {
              view.visible = true;
              focusCore = false;
            } else closeView();
          },
        },
        {
          label: "Toggle Auxiliary Panel",
          click() {
            menuCalls++;
            if (view?.visible) hideView();
            else if (view) {
              view.visible = true;
              focusCore = false;
            }
          },
        },
      ],
    }),
  };
  let time = 0;
  class FastDate extends Date {
    static now() {
      time += 1000;
      return time;
    }
  }
  const module = {
    exports: {} as { runScenario(value: object): Promise<unknown> },
  };
  runInNewContext(source, {
    module,
    process: {
      platform: "win32",
      stderr: process.stderr,
      env: { SystemRoot: "/fixture/windows" },
      pid: 88,
    },
    Date: FastDate,
    JSON,
    setTimeout: (fn: () => void, delay: number) => {
      if (
        delay === 25 &&
        clickObserved &&
        (!options.runDraftPrefix || runStarted) &&
        laterOutputChunks.length
      )
        pty.output += laterOutputChunks.shift()!;
      if (delay === 150 && clickObserved && options.delayedWrites)
        pty.writes.push(...options.delayedWrites);
      if (
        delay === 150 &&
        enterCalls.length &&
        options.delayedEnterWrites &&
        !enterLeakInjected
      ) {
        enterLeakInjected = true;
        pty.writes.push(...options.delayedEnterWrites);
      }
      if (
        delay === 150 &&
        runStarted &&
        options.delayedRunWrites &&
        !runLeakInjected
      ) {
        runLeakInjected = true;
        pty.writes.push(...options.delayedRunWrites);
      }
      queueMicrotask(fn);
      return 0;
    },
    require: (name: string): unknown => {
      if (name === "electron")
        return {
          Menu: menu,
          webContents: {
            getAllWebContents: () => (view && !view.destroyed ? [view] : []),
          },
        };
      if (name === "./snippets-windows-catalog.json") return catalog;
      if (name === "./snippets-memory-input.cjs") {
        const helper =
          require("../fixtures/snippets-memory-input.cjs") as typeof import("../fixtures/snippets-memory-input.cjs");
        return {
          observeFirstInsert: (
            args: Parameters<typeof helper.observeFirstInsert>[0],
          ) => helper.observeFirstInsert({ ...args, waitMs: 0 }),
        };
      }
      if (name === "./snippets-windows-cpr.cjs")
        return require("../fixtures/snippets-windows-cpr.cjs");
      if (name === "./snippets-windows-input.cjs" && options.stopAfterRun) {
        const key = (repeat: boolean, prevented: boolean) =>
          [
            { defaultPrevented: prevented },
            {
              type: "keyDown",
              key: "Enter",
              code: "Enter",
              isAutoRepeat: repeat,
            },
          ] as const;
        return {
          openWindowsInput: () => ({
            observations: [],
            down() {
              inputDowns++;
              if (inputDowns === 1) {
                childInput(...key(false, false));
                runStarted = true;
                pty.writes.push(
                  ...(options.runWrites ?? ["SNIPPETS_RUN", "\r"]),
                );
                if (!options.suppressRunReceipt)
                  pty.output += `${options.runReceiptPrefix ?? ""}SNIPPETS_RUN_RECEIPT\r\n`;
                pty.output += options.runDraftPrefix ?? "";
                focusCore = true;
                if (view) view.visible = false;
              } else {
                coreInput(...key(false, false));
                pty.writes.push("\r");
              }
            },
            repeat() {
              coreInput(...key(true, true));
            },
            up() {},
            close() {},
          }),
        };
      }
      return require(name) as unknown;
    },
  });
  try {
    let caught: unknown;
    let returned: unknown;
    const outcome = await module.exports
      .runScenario({
        window,
        fixture: {
          root,
          evidence: path.join(root, "evidence"),
          readinessDiagnostic: options.readinessDiagnostic === true,
          childInputCapture: options.childInputCapture === true,
          ...(options.memoryInput ? { memoryInput: "a".repeat(32) } : {}),
        },
        ptys,
        children,
        approvalCount: () => 1,
        archiveSha256: "digest",
        insertDiagnostic: diagnostic,
        windowsProbeReady: () => options.windowsProbeReady !== false,
        windowsProbeSnapshot: () => {
          if (options.failReadinessSnapshot)
            throw Error("snapshot unavailable");
          return {
            classification: "startup-readiness-diagnostic-not-qualification",
            checks: { coreObserved: true },
            events: [],
          };
        },
        readinessTraceFailures: () => 0,
        fixtureProcesses: () => [
          { pid: 42, identity: "1" },
          { pid: 1000, identity: "2" },
        ],
      })
      .then(
        (value) => {
          returned = value;
          return "unexpected-success";
        },
        (error: unknown) => {
          caught = error;
          return typeof error === "object" &&
            error !== null &&
            "message" in error &&
            typeof error.message === "string"
            ? error.message
            : String(error);
        },
      );
    const { file, readiness, ptyWrites, checkpoint, checkpointError } =
      await readDiagnosticArtifacts(root);
    return {
      outcome,
      returned,
      elapsed: time,
      caught,
      file,
      readiness,
      ptyWrites,
      checkpoint,
      checkpointError,
      enterCalls,
      clickObserved,
      checkpointAtClick,
      barriersAtClick,
      menuCalls,
    };
  } finally {
    diagnostic?.dispose();
    await rm(root, { recursive: true, force: true });
  }
}

it.each([false, true])(
  "memory diagnostic stops before Enter after first Insert (timeout=%s)",
  async (timeout) => {
    const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
      memoryInput: true,
      suppressProbeReceipt: timeout,
      probeReceipt: true,
    });
    const returned = result.returned as {
      memoryDiagnostic: import("../fixtures/snippets-memory-input.cjs").MemoryResult;
    };
    expect(returned.memoryDiagnostic.initial.kind).toBe(
      timeout ? "timeout" : "receipt",
    );
    expect(returned.memoryDiagnostic.collection.complete).toBe(false);
    expect(result.enterCalls).toEqual([]);
    expect(result.clickObserved).toBe(true);
    expect(result.checkpointAtClick).toBe(false);
    expect(result.checkpoint).toBeUndefined();
    expect(result.ptyWrites?.writes).toEqual(["  SNIPPETS_INSERT  "]);
    if (timeout)
      expect(returned.memoryDiagnostic.initial.error).toBe(
        "Error: Timed out: controlled probe observed first Insert",
      );
  },
);

it("records a startup diagnostic and stops after readiness before Snippets or Enter", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
    readinessDiagnostic: true,
  });
  expect(result.outcome).toBe(
    "SNIPPETS_READINESS_DIAGNOSTIC_STOP_AFTER_PREDICATE",
  );
  expect(result.clickObserved).toBe(false);
  expect(result.menuCalls).toBe(0);
  expect(result.enterCalls).toEqual([]);
  expect(result.readiness).toMatchObject({
    classification: "startup-readiness-diagnostic-not-qualification",
    error: "Error: SNIPPETS_READINESS_DIAGNOSTIC_STOP_AFTER_PREDICATE",
    readinessAtSnapshot: true,
    ptyIdentity: { pid: 42 },
  });
});

it("records the original readiness timeout and stops before any Snippets interaction", async () => {
  const result = await simulatedScenario([], false, {
    readinessDiagnostic: true,
    windowsProbeReady: false,
  });
  expect(result.outcome).toBe(
    "Timed out: controlled Windows probe renderer readiness",
  );
  expect(result.menuCalls).toBe(0);
  expect(result.enterCalls).toEqual([]);
  expect(result.readiness).toMatchObject({
    error: "Error: Timed out: controlled Windows probe renderer readiness",
    readinessAtSnapshot: false,
    ptyIdentity: { pid: 42 },
  });
});

it("preserves the readiness timeout if snapshot collection itself fails", async () => {
  const result = await simulatedScenario([], false, {
    readinessDiagnostic: true,
    windowsProbeReady: false,
    failReadinessSnapshot: true,
  });
  expect(result.outcome).toBe(
    "Timed out: controlled Windows probe renderer readiness",
  );
  expect(result.readiness?.snapshotError).toContain("snapshot unavailable");
  expect(result.menuCalls).toBe(0);
});

it("does not overwrite prior readiness evidence or replace the timeout", async () => {
  const result = await simulatedScenario([], false, {
    readinessDiagnostic: true,
    windowsProbeReady: false,
    existingReadinessArtifact: true,
  });
  expect(result.outcome).toBe(
    "Timed out: controlled Windows probe renderer readiness",
  );
  expect(result.readiness).toMatchObject({
    classification: "existing",
    error: "preserve",
  });
  expect(result.menuCalls).toBe(0);
});

it("does not dispatch the first Insert while the renderer has not consumed probe modes", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], true, {
    windowsProbeReady: false,
  });
  expect(result.outcome).toBe(
    "Timed out: controlled Windows probe renderer readiness",
  );
  expect(result.clickObserved).toBe(false);
  expect(result.enterCalls).toEqual([]);
});

it("rejects and retains an unknown control write before the first Insert", async () => {
  const result = await simulatedScenario(
    ["\u001b[1;2R", "  SNIPPETS_INSERT  "],
    true,
  );
  expect(result.outcome).toBe("Unexpected PTY protocol write");
  assert.ok(result.file);
  expect(result.file.sessions[0]!.writes).toEqual([
    "\u001b[1;2R",
    "  SNIPPETS_INSERT  ",
  ]);
  expect(result.file.expected).toBe("  SNIPPETS_INSERT  ");
  expect(result.file.clickDispatched).toBe(true);
  expect(
    result.file.events.map((event: { kind: string }) => event.kind),
  ).toContain("request");
  expect(result.enterCalls).toEqual([]);
});

it("classifies the captured focus reports while retaining the exact Insert and raw writes", async () => {
  const writes = [
    "  SNIPPETS_INSERT  ",
    "\u001b[O",
    "\u001b[I",
    "\u001b[O",
    "\u001b[I",
  ];
  const result = await simulatedScenario(writes, true, { probeReceipt: true });
  expect(result.outcome).toBe(
    "SNIPPETS_INSERT_DIAGNOSTIC_STOP_AFTER_EXACT_BYTES",
  );
  assert.ok(result.file);
  expect(result.file.sessions[0]!.writes).toEqual(writes);
  expect(result.ptyWrites).toMatchObject({
    writes,
    checks: [
      {
        expected: "  SNIPPETS_INSERT  ",
        nonFocus: "  SNIPPETS_INSERT  ",
        focus: [
          { index: 1, kind: "out" },
          { index: 2, kind: "in" },
          { index: 3, kind: "out" },
          { index: 4, kind: "in" },
        ],
      },
    ],
  });
  expect(result.enterCalls).toEqual([]);
});

it("accepts a correlated CPR during the actual first-Insert scenario assertion", async () => {
  const writes = ["  SNIPPETS_INSERT  ", "\u001b[4;1R"];
  const result = await simulatedScenario(writes, true, {
    probeReceipt: true,
    cprObservation: true,
    observedOutput:
      "\u001b[?1004l\u001b[?2004lSNIPPETS_SHELL_READY\r\n" +
      "\u001b[6n\u001b[2;1HSNIPPETS_INSERT_DRAFT_RECEIPT\r\n" +
      "SNIPPETS_DIAGNOSTIC_INSERT_RECEIVED\r\n",
  });
  expect(result.outcome).toBe(
    "SNIPPETS_INSERT_DIAGNOSTIC_STOP_AFTER_EXACT_BYTES",
  );
  expect(result.ptyWrites).toMatchObject({
    writes,
    checks: [{ cpr: [{ index: 1, row: 4, column: 1, requestIndex: 0 }] }],
    cprTrace: { writeEnd: 2, incomplete: false },
  });
  expect(result.enterCalls).toEqual([]);
});

it("recognizes the first exact draft after a ConPTY cursor position without changing writes", async () => {
  const observedOutput =
    "\u001b[?1004l\u001b[?2004lSNIPPETS_SHELL_READY\r\n" +
    "\u001b[6n\u001b[2;1HSNIPPETS_INSERT_DRAFT_RECEIPT\r\n" +
    "SNIPPETS_DIAGNOSTIC_INSERT_RECEIVED\r\n";
  const writes = ["  SNIPPETS_INSERT  ", "\u001b[O", "\u001b[I"];
  const result = await simulatedScenario(writes, true, {
    probeReceipt: true,
    observedOutput,
  });
  expect(result.outcome).toBe(
    "SNIPPETS_INSERT_DIAGNOSTIC_STOP_AFTER_EXACT_BYTES",
  );
  expect(result.ptyWrites?.childOutput.text).toBe(observedOutput);
  expect(result.ptyWrites?.writes).toEqual(writes);
  expect(result.enterCalls).toEqual([]);
});

it("waits for the positioned draft and diagnostic receipt across output callbacks", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], true, {
    probeReceipt: true,
    observedOutput:
      "\u001b[?1004l\u001b[?2004lSNIPPETS_SHELL_READY\r\n\u001b[6n\u001b[2;",
    laterOutputChunks: [
      "1HSNIPPETS_INSERT_",
      "DRAFT_RECEIPT",
      "\r",
      "\nSNIPPETS_DIAGNOSTIC_INSERT_RECEIVED\r\n",
    ],
  });
  expect(result.outcome).toBe(
    "SNIPPETS_INSERT_DIAGNOSTIC_STOP_AFTER_EXACT_BYTES",
  );
  expect(result.ptyWrites?.childOutput.text).toContain(
    "\u001b[2;1HSNIPPETS_INSERT_DRAFT_RECEIPT\r\n",
  );
  expect(result.enterCalls).toEqual([]);
});

it.each([
  {
    name: "duplicate draft",
    receipt:
      "\u001b[2;1HSNIPPETS_INSERT_DRAFT_RECEIPT\r\n" +
      "\u001b[3;1HSNIPPETS_INSERT_DRAFT_RECEIPT\r\n" +
      "SNIPPETS_DIAGNOSTIC_INSERT_RECEIVED\r\n",
    error: "Timed out: controlled probe observed first Insert",
  },
  {
    name: "invalid draft suffix",
    receipt:
      "\u001b[2;1HSNIPPETS_INSERT_DRAFT_RECEIPT_EXTRA\r\n" +
      "SNIPPETS_DIAGNOSTIC_INSERT_RECEIVED\r\n",
    error: "Invalid controlled probe receipt framing",
  },
  {
    name: "duplicate diagnostic receipt",
    receipt:
      "\u001b[2;1HSNIPPETS_INSERT_DRAFT_RECEIPT\r\n" +
      "SNIPPETS_DIAGNOSTIC_INSERT_RECEIVED\r\n" +
      "SNIPPETS_DIAGNOSTIC_INSERT_RECEIVED\r\n",
    error: "Timed out: controlled probe observed first Insert",
  },
])("rejects $name without sending Enter", async ({ receipt, error }) => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], true, {
    probeReceipt: true,
    observedOutput: `\u001b[?2004lSNIPPETS_SHELL_READY\r\n${receipt}`,
  });
  expect(result.outcome).toContain(error);
  expect(result.enterCalls).toEqual([]);
});

it("retains focus reports arriving during the unchanged post-Insert drain", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], true, {
    delayedWrites: ["\u001b[O", "\u001b[I"],
  });
  expect(result.outcome).toBe(
    "SNIPPETS_INSERT_DIAGNOSTIC_STOP_AFTER_EXACT_BYTES",
  );
  assert.ok(result.file);
  expect(result.file.sessions[0]!.writes).toEqual([
    "  SNIPPETS_INSERT  ",
    "\u001b[O",
    "\u001b[I",
  ]);
  expect(result.enterCalls).toEqual([]);
});

it("rejects delayed non-focus leakage during the unchanged post-Insert drain", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], true, {
    delayedWrites: ["x"],
  });
  expect(result.outcome).toContain("no delayed repeat/release leakage");
  expect(result.file?.sessions[0]!.writes).toEqual([
    "  SNIPPETS_INSERT  ",
    "x",
  ]);
  expect(result.enterCalls).toEqual([]);
});

it("records an absent selected write and a distinct late wrong-target write", async () => {
  const result = await simulatedScenario([], true, {
    otherWrites: ["  SNIPPETS_INSERT  "],
  });
  expect(result.outcome).toBe("Timed out: exact PTY bytes");
  assert.ok(result.file);
  expect(result.file.selectedIndex).toBe(0);
  expect(result.file.sessions[0]!.writes).toEqual([]);
  expect(result.file.sessions[1]).toMatchObject({
    pid: 77,
    selected: false,
    writes: ["  SNIPPETS_INSERT  "],
  });
  expect(result.enterCalls).toEqual([]);
});

it.each(["  SNIPPETS_INSERT  \r", "\u001b[200~  SNIPPETS_INSERT  \u001b[201~"])(
  "does not accept translated or framed bytes %j as the exact Insert",
  async (written) => {
    const result = await simulatedScenario([written], true);
    expect(result.outcome).toBe(
      written.includes("\u001b")
        ? "Unexpected PTY protocol write"
        : "Timed out: exact PTY bytes",
    );
    assert.ok(result.file);
    expect(result.file.sessions[0]!.writes).toEqual([written]);
  },
);

it.each([
  { name: "prefix", writes: ["  SNIPPETS_INSERT "] },
  { name: "duplicate", writes: ["  SNIPPETS_INSERT  ", "  SNIPPETS_INSERT  "] },
  { name: "newline", writes: ["  SNIPPETS_INSERT  ", "\n"] },
  { name: "unknown escape", writes: ["  SNIPPETS_INSERT  ", "\u001b[?9h"] },
  { name: "focus embedded in data", writes: ["  SNIPPETS_INSERT  \u001b[I"] },
  { name: "split focus", writes: ["  SNIPPETS_INSERT  ", "\u001b[", "I"] },
])(
  "rejects $name without accepting a prefix or hiding raw writes",
  async ({ writes }) => {
    const result = await simulatedScenario(writes, true, {
      probeReceipt: true,
    });
    expect(result.outcome).toBe(
      writes.some((chunk) => chunk.includes("\u001b"))
        ? "Unexpected PTY protocol write"
        : "Timed out: exact PTY bytes",
    );
    expect(result.file?.sessions[0]!.writes).toEqual(writes);
    expect(result.enterCalls).toEqual([]);
  },
);

it("retains the write diagnosis and primary timeout when later screenshot capture fails", async () => {
  const result = await simulatedScenario([], true, {
    failFailureCapture: true,
  });
  expect(result.outcome).toBe("Timed out: exact PTY bytes");
  assert.ok(result.file);
  expect(result.file.sessions[0]!.writes).toEqual([]);
});

it("captures the first-Insert checkpoint without enabling the stopping diagnostic", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
    childInputCapture: true,
    stopAfterFirstEnter: true,
  });
  expect(result.outcome).toBe("TEST_AFTER_FIRST_ENTER");
  expect(result.checkpoint).toMatchObject({
    phase: "before-first-insert-click",
    pid: 42,
    writeOffset: 0,
  });
  expect(result.file).toBeUndefined();
  expect(result.checkpointAtClick).toBe(true);
  expect(result.enterCalls).toHaveLength(2);
});

it("records a selected-session checkpoint before the first Insert only in diagnostic mode", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], true);
  expect(result.outcome).toBe(
    "SNIPPETS_INSERT_DIAGNOSTIC_STOP_AFTER_EXACT_BYTES",
  );
  expect(result.checkpoint).toMatchObject({
    phase: "before-first-insert-click",
    pid: 42,
    writeOffset: 0,
  });
  expect(result.file?.childInputCheckpointError).toBeUndefined();
  const ordinary = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
    stopAfterFirstEnter: true,
  });
  expect(ordinary.checkpoint).toBeUndefined();
  expect(ordinary.checkpointAtClick).toBe(false);
});

it("retains a capture-only checkpoint failure beside the original scenario timeout", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
    childInputCapture: true,
    existingChildCheckpoint: true,
    suppressProbeReceipt: true,
  });
  expect(result.outcome).toBe(
    "Timed out: controlled probe observed first Insert",
  );
  expect(result.checkpoint).toMatchObject({ phase: "prior", pid: 999 });
  expect(result.ptyWrites?.childInputCheckpointError).toContain("EEXIST");
  expect(result.checkpointError).toMatchObject({
    phase: "before-first-insert-click",
    classification: "synthetic-child-input-diagnostic-not-qualification",
    error: result.ptyWrites?.childInputCheckpointError,
  });
  expect(result.file).toBeUndefined();
  expect(result.enterCalls).toEqual([]);
});

it("preserves a prior checkpoint-error sidecar and records both capture errors", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
    childInputCapture: true,
    existingChildCheckpoint: true,
    existingCheckpointErrorSidecar: true,
    suppressProbeReceipt: true,
  });
  expect(result.outcome).toBe(
    "Timed out: controlled probe observed first Insert",
  );
  expect(result.checkpointError).toEqual({ phase: "prior", error: "preserve" });
  expect(result.ptyWrites?.childInputCheckpointError).toContain("EEXIST");
  expect(result.ptyWrites?.childInputCheckpointSidecarError).toContain(
    "EEXIST",
  );
});

it("keeps the checkpoint sidecar when PTY persistence also fails", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
    childInputCapture: true,
    existingChildCheckpoint: true,
    existingPtyArtifact: true,
    suppressProbeReceipt: true,
  });
  expect(result.outcome).toBe("Scenario and PTY evidence failed");
  const failures = result.caught as { errors: Error[] };
  expect(String(failures.errors[0])).toContain(
    "Timed out: controlled probe observed first Insert",
  );
  expect(String(failures.errors[1])).toContain("EEXIST");
  expect(result.checkpointError?.error).toContain("EEXIST");
  expect(result.ptyWrites?.writes).toEqual(["prior"]);
});

it("retains a checkpoint write error without overwriting or replacing the scenario failure", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], true, {
    existingChildCheckpoint: true,
  });
  expect(result.outcome).toBe(
    "SNIPPETS_INSERT_DIAGNOSTIC_STOP_AFTER_EXACT_BYTES",
  );
  expect(result.checkpoint).toMatchObject({ phase: "prior", pid: 999 });
  expect(result.file?.childInputCheckpointError).toContain("EEXIST");
});

it("retains the selected child receipt on the real scenario failure path", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
    stopAfterFirstEnter: true,
  });
  expect(result.outcome).toBe("TEST_AFTER_FIRST_ENTER");
  expect(result.ptyWrites?.childOutput).toMatchObject({
    truncated: false,
    limitCodeUnits: 65536,
  });
  expect(result.ptyWrites?.childOutput.text).toContain(
    "SNIPPETS_INSERT_DRAFT_RECEIPT\r\n",
  );
  expect(result.ptyWrites?.childOutput.text).toContain(
    "SNIPPETS_INSERT_RECEIPT\r\n",
  );
});

it("does not overwrite prior PTY evidence and keeps the original scenario failure", async () => {
  const result = await simulatedScenario([], true, {
    existingPtyArtifact: true,
  });
  expect(result.outcome).toBe("Scenario and PTY evidence failed");
  const aggregate = result.caught as { errors: Error[] };
  expect(String(aggregate.errors[0])).toContain("Timed out: exact PTY bytes");
  expect(String(aggregate.errors[1])).toContain("EEXIST");
  expect(result.file?.error).toBe("Error: Timed out: exact PTY bytes");
  expect(result.ptyWrites?.writes).toEqual(["prior"]);
});

it("preserves actual PTY evidence when the later view focus getter fails", async () => {
  const result = await simulatedScenario(["unexpected"], true, {
    failDiagnosticFocus: true,
  });
  expect(result.outcome).toBe("Timed out: exact PTY bytes");
  assert.ok(result.file);
  expect(result.file.sessions[0]!.writes).toEqual(["unexpected"]);
  expect(result.file.focusAfter.view).toBeNull();
});

it("stops a diagnostic only after the unchanged exact-write assertion, before Enter", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], true);
  expect(result.outcome).toBe(
    "SNIPPETS_INSERT_DIAGNOSTIC_STOP_AFTER_EXACT_BYTES",
  );
  assert.ok(result.file);
  expect(result.file.classification).toBe(
    "synthetic-insert-diagnostic-not-qualification",
  );
  expect(result.file.sessions[0]!.writes).toEqual(["  SNIPPETS_INSERT  "]);
  expect(result.barriersAtClick).toBe(2);
  expect(result.enterCalls).toEqual([]);
});

it("distinguishes an exact node-pty write from missing probe receipt", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], true, {
    suppressProbeReceipt: true,
  });
  expect(result.outcome).toBe(
    "Timed out: controlled probe observed first Insert",
  );
  assert.ok(result.file);
  expect(result.file.sessions[0]!.writes).toEqual(["  SNIPPETS_INSERT  "]);
  expect(result.enterCalls).toEqual([]);
});

it("refuses ordinary Insert before Enter when the child has not received the exact draft", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
    suppressProbeReceipt: true,
  });
  expect(result.outcome).toBe(
    "Timed out: controlled probe observed first Insert",
  );
  expect(result.enterCalls).toEqual([]);
});

it("refuses to infer a child receipt from truncated output", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
    outputTruncated: true,
  });
  expect(result.outcome).toContain("probe output retained");
  expect(result.ptyWrites?.childOutput.truncated).toBe(true);
  expect(result.ptyWrites?.childOutput.text).toContain(
    "SNIPPETS_INSERT_DRAFT_RECEIPT",
  );
  expect(result.enterCalls).toEqual([]);
});

it("requires one exact Enter and child receipt before the next interaction", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
    stopAfterFirstEnter: true,
    enterWrites: ["\u001b[O", "\r", "\u001b[I"],
  });
  expect(result.outcome).toBe("TEST_AFTER_FIRST_ENTER");
  expect(result.enterCalls).toHaveLength(2);
  expect(result.ptyWrites?.checks.map((check) => check.nonFocus)).toEqual([
    "  SNIPPETS_INSERT  ",
    "\r",
  ]);
});

it("recognizes a positioned executed-Insert receipt before continuing", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
    stopAfterFirstEnter: true,
    enterReceiptPrefix: "\u001b[6n\u001b[4;1H",
  });
  expect(result.outcome).toBe("TEST_AFTER_FIRST_ENTER");
  expect(result.ptyWrites?.childOutput.text).toContain(
    "\u001b[4;1HSNIPPETS_INSERT_RECEIPT\r\n",
  );
});

it("does not advance after duplicate executed-Insert receipts", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
    stopAfterFirstEnter: true,
    enterReceiptPrefix: "\u001b[4;1H",
    enterReceiptCopies: 2,
  });
  expect(result.outcome).toBe(
    "Timed out: shell executed exact insert after explicit Enter",
  );
});

it("rejects a delayed duplicate Enter after the first exact Enter", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
    stopAfterFirstEnter: true,
    delayedEnterWrites: ["\r"],
  });
  expect(result.outcome).toContain("no delayed repeat/release leakage");
  expect(result.ptyWrites?.writes).toEqual(["  SNIPPETS_INSERT  ", "\r", "\r"]);
});

it("requires exact Run, prevented repeat, probe receipt, and a fresh Enter", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
    stopAfterRun: true,
    runWrites: ["\u001b[O", "SNIPPETS_RUN", "\r", "\u001b[I"],
  });
  expect(result.outcome).toBe("TEST_AFTER_RUN");
  expect(result.ptyWrites?.checks.map((check) => check.nonFocus)).toEqual([
    "  SNIPPETS_INSERT  ",
    "\r",
    "SNIPPETS_RUN\r",
    "\r",
  ]);
});

it("recognizes a positioned Run receipt through the later Run wait", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
    stopAfterRun: true,
    runReceiptPrefix: "\u001b[6n\u001b[2;1H",
  });
  expect(result.outcome).toBe("TEST_AFTER_RUN");
  expect(result.ptyWrites?.childOutput.text).toContain(
    "\u001b[2;1HSNIPPETS_RUN_RECEIPT\r\n",
  );
});

it("waits for a partially delivered earlier Run draft before taking its baseline", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
    stopAfterRun: true,
    runDraftPrefix: "\u001b[3;1HSNIPPETS_RUN_DRAFT_RE",
    laterOutputChunks: ["CEIPT\r", "\n"],
  });
  expect(result.outcome).toBe("TEST_AFTER_RUN");
  expect(result.ptyWrites?.childOutput.text).toContain(
    "\u001b[3;1HSNIPPETS_RUN_DRAFT_RECEIPT\r\n",
  );
});

it("does not accept an exact Run write without the child's matching receipt", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
    stopAfterRun: true,
    suppressRunReceipt: true,
  });
  expect(result.outcome).toBe("Timed out: controlled probe received exact Run");
});

it.each([
  { name: "prefix", writes: ["SNIPPETS_RU", "\r"] },
  { name: "duplicate", writes: ["SNIPPETS_RUN", "\r", "SNIPPETS_RUN", "\r"] },
  { name: "newline", writes: ["SNIPPETS_RUN", "\r", "\n"] },
  { name: "unknown control", writes: ["SNIPPETS_RUN", "\r", "\u001b[1;2R"] },
])("refuses $name Run input before a fresh Enter", async ({ writes }) => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
    stopAfterRun: true,
    runWrites: writes,
  });
  expect(result.outcome).toBe(
    writes.some((chunk) => chunk.includes("\u001b"))
      ? "Unexpected PTY protocol write"
      : "Timed out: exact PTY bytes",
  );
  expect(result.ptyWrites?.writes.slice(2)).toEqual(writes);
});

it("rejects delayed Run repetition even after the exact Run was observed", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false, {
    stopAfterRun: true,
    delayedRunWrites: ["SNIPPETS_RUN", "\r"],
  });
  expect(result.outcome).toContain("no delayed repeat/release leakage");
  expect(result.ptyWrites?.writes).toEqual([
    "  SNIPPETS_INSERT  ",
    "\r",
    "SNIPPETS_RUN",
    "\r",
    "SNIPPETS_RUN",
    "\r",
  ]);
});

it("leaves ordinary qualification on its existing post-Insert Enter path", async () => {
  const result = await simulatedScenario(["  SNIPPETS_INSERT  "], false);
  expect(result.outcome).toBe("TEST_EXPLICIT_ENTER");
  expect(result.file).toBeUndefined();
  expect(result.readiness).toBeUndefined();
  expect(result.enterCalls).toHaveLength(1);
});
