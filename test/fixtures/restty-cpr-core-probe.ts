import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createInputHandler, loadResttyWasm } from "restty/internal";

export const preparedCprRuntime = () =>
  readFileSync("node_modules/restty/dist/chunk-c0rcpsc5.js", "utf8");

// Fail closed rather than silently exercising an empty or different function.
export function runtimeSection(source: string, start: string, end: string) {
  assert.equal(source.split(start).length - 1, 1, start);
  assert.equal(source.split(end).length - 1, 1, end);
  const first = source.indexOf(start);
  const last = source.indexOf(end);
  assert(last > first, `${start} / ${end}`);
  return source.slice(first, last);
}

type TransportCallbacks = { onConnect(): void; onData(text: string): void };
type PtyRuntime = {
  connectPty(): void;
  disconnectPty(): void;
  scheduleSyncOutputReset(): void;
  cancelSyncOutputReset(): void;
};
type Controller = {
  sendInput(text: string, source: string): void;
  flushWasmOutputToPty(): void;
};

// Production onData -> filter -> controller -> real WASM -> reply transport.
// Only transport, geometry and render notifications are controlled; no frame
// loop runs. Alternate source is solely for deliberate negative controls.
export async function cprCoreFixture(
  cols = 80,
  rows = 6,
  alternateSource?: string,
) {
  const source = alternateSource ?? preparedCprRuntime();
  const globals = { TextEncoder, TextDecoder, setTimeout, clearTimeout };
  const makeHandler = alternateSource
    ? (runInNewContext(
        runtimeSection(
          source,
          "// src/input/keymap/constants.ts",
          "// src/fonts/manager/classification.ts",
        ) + "\ncreateInputHandler2",
        globals,
      ) as typeof createInputHandler)
    : createInputHandler;
  const createController = runInNewContext(
    runtimeSection(
      source,
      "function createRuntimeControllerInput(options) {",
      "// src/runtime/create-runtime/runtime-controller.keyboard.ts",
    ) + "\ncreateRuntimeControllerInput",
    globals,
  ) as (options: Record<string, unknown>) => Controller;
  const createPty = runInNewContext(
    runtimeSection(
      source,
      "function createPtyInputRuntime(options) {",
      "// src/runtime/create-runtime/interaction-runtime/desktop-word-selection.ts",
    ) + "\ncreatePtyInputRuntime",
    globals,
  ) as (options: Record<string, unknown>) => PtyRuntime;
  const wasm = await loadResttyWasm();
  const handle = wasm.create(cols, rows, 10_000_000);
  assert(handle);
  const replies: string[] = [];
  const writes: string[] = [];
  const events: unknown[] = [];
  let callbacks: TransportCallbacks | undefined;
  let grid = { cols, rows };
  const ptyTransport = {
    isConnected: () => !!callbacks,
    connect(args: { callbacks: TransportCallbacks }) {
      callbacks = args.callbacks;
      callbacks.onConnect();
    },
    disconnect() {
      callbacks = undefined;
    },
    sendInput(data: string) {
      replies.push(data);
      return true;
    },
    resize() {},
  };
  // Intentionally stale: a render/provider coordinate must not answer CPR.
  const staleCursor = () => ({ row: 7, col: 11 });
  const inputHandler = makeHandler({
    sendReply: (data) => ptyTransport.sendInput(data),
    getCursorPosition: staleCursor,
    getWindowMetrics: () => ({
      ...grid,
      widthPx: grid.cols * 10,
      heightPx: grid.rows * 20,
      cellWidthPx: 10,
      cellHeightPx: 20,
    }),
  });
  const state = { wasm, wasmHandle: handle, wasmReady: true };
  let ptyRuntime: PtyRuntime;
  const controller = createController({
    readState: () => state,
    writeState: (next: Partial<typeof state>) => Object.assign(state, next),
    ptyTransport,
    inputHandler,
    forwardTerminalReplies: true,
    runBeforeRenderOutputHook: (text: string) => {
      writes.push(text);
      return text;
    },
    interaction: { linkState: {}, selectionState: {} },
    emitRuntimeEvent: (event: unknown) => events.push(event),
    markSearchDirty() {},
    ptyInputRuntime: {
      scheduleSyncOutputReset: () => ptyRuntime.scheduleSyncOutputReset(),
      cancelSyncOutputReset: () => ptyRuntime.cancelSyncOutputReset(),
    },
  });
  ptyRuntime = createPty({
    ptyTransport,
    inputHandler,
    getGridSize: () => grid,
    getCursorForCpr: staleCursor,
    sendInput: controller.sendInput,
    syncOutputResetMs: 1000,
    syncOutputResetSeq: "\u001b[?2026l",
  });
  ptyRuntime.connectPty();
  return {
    replies,
    writes,
    events,
    write(text: string) {
      assert(callbacks);
      callbacks.onData(text);
    },
    resize(nextCols: number, nextRows = rows) {
      grid = { cols: nextCols, rows: nextRows };
      wasm.resize(handle, nextCols, nextRows);
      controller.flushWasmOutputToPty();
    },
    // The filter's own screen flag, which the window reports with a read.
    altScreen: () => inputHandler.isAltScreen(),
    cursor() {
      // Final-state control only, never the query oracle or reply provider.
      wasm.renderUpdate(handle);
      const cursor = wasm.getRenderState(handle)?.cursor;
      assert(cursor);
      return { row: cursor.row + 1, col: cursor.col + 1 };
    },
    text() {
      return wasm.getSelectionText(handle, 0, 0, grid.rows - 1, grid.cols - 1);
    },
    rawWrite(text: string) {
      wasm.write(handle, text);
      return wasm.drainOutput(handle);
    },
    dispose() {
      ptyRuntime.disconnectPty();
      wasm.destroy(handle);
    },
  };
}
