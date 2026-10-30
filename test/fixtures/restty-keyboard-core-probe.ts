import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { createInputHandler, loadResttyWasm } from "restty/internal";
import { preparedCprRuntime, runtimeSection } from "./restty-cpr-core-probe";

// Production output ingestion, core state providers, DOM key binding and final
// PTY mapping. Only the transport, focus host and render notifications are fakes.
export async function keyboardCoreFixture(claimKeys = false) {
  const source = preparedCprRuntime();
  const listeners = new Map<string, (event: KeyboardEvent) => void>();
  const window = {
    addEventListener: (
      name: string,
      listener: (event: KeyboardEvent) => void,
    ) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
  };
  const globals = {
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    performance,
    window,
  };
  const extract = <T>(start: string, end: string, name: string) =>
    runInNewContext(
      runtimeSection(source, start, end) + `\n${name}`,
      globals,
    ) as (options: Record<string, unknown>) => T;
  const makeController = extract<{
    sendInput(text: string, source: string): void;
  }>(
    "function createRuntimeControllerInput(options) {",
    "// src/runtime/create-runtime/runtime-controller.keyboard.ts",
    "createRuntimeControllerInput",
  );
  const makePty = extract<{
    connectPty(): void;
    disconnectPty(): void;
    scheduleSyncOutputReset(): void;
    cancelSyncOutputReset(): void;
  }>(
    "function createPtyInputRuntime(options) {",
    "// src/runtime/create-runtime/interaction-runtime/desktop-word-selection.ts",
    "createPtyInputRuntime",
  );
  const bindKeyboard = extract<void>(
    "function attachRuntimeControllerKeyboardEvents(options) {",
    "// src/runtime/create-runtime/runtime-controller.lifecycle.ts",
    "attachRuntimeControllerKeyboardEvents",
  );
  const wasm = await loadResttyWasm();
  const handle = wasm.create(80, 24, 1_000_000);
  assert(handle);
  // Extract the production providers too: manually wiring a new getter here
  // would hide a missing connection in the real runtime construction.
  const providers = runInNewContext(
    "({" +
      runtimeSection(
        source,
        "    getKittyKeyboardFlags: () => {",
        "    onWindowOp: () => {},",
      ) +
      "})",
    { wasm, wasmHandle: handle },
  ) as Parameters<typeof createInputHandler>[0];
  const inputHandler = createInputHandler(providers);
  const sent: string[] = [];
  const routed: string[] = [];
  let callbacks: { onConnect(): void; onData(text: string): void } | undefined;
  const transport = {
    isConnected: () => !!callbacks,
    connect(options: { callbacks: typeof callbacks }) {
      callbacks = options.callbacks;
      callbacks?.onConnect();
    },
    disconnect() {
      callbacks = undefined;
    },
    resize() {},
    sendInput(text: string) {
      sent.push(text);
      return true;
    },
  };
  const state = { wasm, wasmHandle: handle, wasmReady: true };
  const readState = () => state;
  const writeState = (next: Partial<typeof state>) =>
    Object.assign(state, next);
  let pty: ReturnType<typeof makePty>;
  const controller = makeController({
    readState,
    writeState,
    ptyTransport: transport,
    inputHandler,
    forwardTerminalReplies: true,
    runBeforeRenderOutputHook: (text: string) => text,
    interaction: { linkState: {}, selectionState: {} },
    emitRuntimeEvent() {},
    markSearchDirty() {},
    ptyInputRuntime: {
      scheduleSyncOutputReset: () => pty.scheduleSyncOutputReset(),
      cancelSyncOutputReset: () => pty.cancelSyncOutputReset(),
    },
  });
  pty = makePty({
    ptyTransport: transport,
    inputHandler,
    getGridSize: () => ({ cols: 80, rows: 24 }),
    getCursorForCpr: () => ({ row: 1, col: 1 }),
    sendInput: controller.sendInput,
    runBeforeInputHook: (text: string) => text,
    routeKeyInput: (text: string) => {
      routed.push(text);
      return claimKeys;
    },
    shouldClearSelection: () => false,
    syncOutputResetMs: 1000,
    syncOutputResetSeq: "\u001b[?2026l",
  });
  const cleanupFns: Array<() => void> = [];
  const canvas = { tagName: "CANVAS" };
  bindKeyboard({
    readState,
    writeState,
    inputHandler,
    ptyInputRuntime: pty,
    cleanupFns,
    interaction: { imeState: { composing: false } },
    getCanvas: () => canvas,
    getOptionKeyMode: () => "none",
    isMacPlatform: false,
    KITTY_FLAG_REPORT_EVENTS: 2,
  });
  pty.connectPty();
  return {
    sent,
    routed,
    write(text: string) {
      assert(callbacks);
      callbacks.onData(text);
    },
    key(key: string, options: Partial<KeyboardEvent> = {}) {
      const event = {
        key,
        code: key,
        type: "keydown",
        repeat: false,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        isComposing: false,
        target: canvas,
        preventDefault() {},
        ...options,
      } as KeyboardEvent;
      const listener = listeners.get(event.type);
      assert(listener);
      listener(event);
    },
    dispose() {
      for (const cleanup of cleanupFns) cleanup();
      pty.disconnectPty();
      wasm.destroy(handle);
    },
  };
}
