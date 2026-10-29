import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { inputRoutingCorrections } from "../../scripts/restty-input-routing-corrections.mjs";
import { syntheticBoldCorrections } from "../../scripts/restty-synthetic-bold-corrections.mjs";
import { runInNewContext } from "node:vm";
import { createInputHandler } from "restty/internal";
import { describe, expect, it, vi } from "vitest";
import { runtimeSection } from "../fixtures/restty-cpr-core-probe";

const source = readFileSync(
  "node_modules/restty/dist/chunk-c0rcpsc5.js",
  "utf8",
);
function production<T>(start: string, end: string, name: string): T {
  return runInNewContext(runtimeSection(source, start, end) + `\n${name}`, {
    performance,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: () => 0,
  }) as T;
}
type Factory<T> = (options: Record<string, unknown>) => T;
const makePty = production<
  Factory<{ sendKeyInput(text: string, source?: string): void }>
>(
  "function createPtyInputRuntime(options) {",
  "// src/runtime/create-runtime/interaction-runtime/desktop-word-selection.ts",
  "createPtyInputRuntime",
);
const makePointer = production<
  Factory<(event: Record<string, unknown>) => void>
>(
  "function createPointerUpHandler(options) {",
  "// src/runtime/create-runtime/interaction-runtime/bind-pointer-events.ts",
  "createPointerUpHandler",
);
const bindIme = production<Factory<void>>(
  "function bindImeEvents(options) {",
  "// src/runtime/create-runtime/interaction-runtime/bind-pointer-aux-handlers.ts",
  "bindImeEvents",
);
function harness(claim = true) {
  const local = vi.fn();
  const routed = vi.fn((_text: string) => claim);
  const inputHandler = createInputHandler({ sendReply: local });
  const pty = makePty({
    inputHandler,
    ptyTransport: { isConnected: () => true, sendInput: local },
    runBeforeInputHook: (text: string) => text,
    routeKeyInput: routed,
    shouldClearSelection: () => false,
  });
  return { local, routed, inputHandler, pty };
}

describe("actual prepared final-key routing", () => {
  it("preserves the historical font baseline while isolating synthesis on current routing", () => {
    const hash = (text: string) =>
      createHash("sha256").update(text).digest("hex");
    const reverse = (
      text: string,
      edits: { original: string; corrected: string }[],
    ) =>
      edits.reduce((value, { original, corrected }) => {
        expect(value.split(corrected)).toHaveLength(2);
        return value.replace(corrected, original);
      }, text);
    const prior = reverse(source, inputRoutingCorrections);
    expect(hash(prior)).toBe(
      "f15c6c25cb2efb879b5a00b09640fcdb2d364c8d566237ff5d0ae63975bb3e44",
    );
    const historicalControl = reverse(prior, syntheticBoldCorrections);
    expect(hash(historicalControl)).toBe(
      "b4112dacd54853f78333a3d5d65f8a87825b1ff45adb53cbfb45726b58a83625",
    );
    const currentControl = reverse(source, syntheticBoldCorrections);
    expect(hash(currentControl)).toBe(
      "20a8fc66883c87c5832e4a8054919ad901be1e538cadead3a775bd86c9abceb6",
    );
    expect(reverse(currentControl, inputRoutingCorrections)).toBe(
      historicalControl,
    );
  });
  it("claims only final mapped key bytes, or preserves ordinary local delivery", () => {
    const f = harness();
    // This Kitty-shaped input is mapped to ordinary Enter by the real encoder.
    f.pty.sendKeyInput("\u001b[13u");
    f.pty.sendKeyInput("á");
    f.pty.sendKeyInput("\u001b[A");
    f.pty.sendKeyInput("\u001b[97;1:2u");
    f.pty.sendKeyInput("\u001b[97;1:3u");
    expect(f.routed.mock.calls.map(([text]) => text)).toEqual([
      "\r",
      "á",
      "\u001b[A",
      "\u001b[97;1:2u",
      "\u001b[97;1:3u",
    ]);
    expect(f.local).not.toHaveBeenCalled();
    f.pty.sendKeyInput("\u001b[I", "program");
    expect(f.local).toHaveBeenCalledWith("\u001b[I");
    const ordinary = harness(false);
    ordinary.pty.sendKeyInput("\u001b[13u");
    expect(ordinary.local).toHaveBeenCalledExactlyOnceWith("\r");
  });

  it("keeps actual OSC133 prompt-click reports source-local", () => {
    const f = harness();
    f.inputHandler.filterOutput(
      "\u001b]133;A;click_events=1\u0007\u001b]133;B\u0007",
    );
    expect(f.inputHandler.isPromptClickEventsEnabled()).toBe(true);
    const pointer = makePointer({
      inputHandler: f.inputHandler,
      sendKeyInput: f.pty.sendKeyInput,
      isTouchPointer: () => false,
      normalizeSelectionCell: (cell: unknown) => cell,
      positionToCell: () => ({ row: 1, col: 3 }),
      selectionState: { active: false, dragging: false },
      desktopSelectionState: {},
      shouldRoutePointerToAppMouse: () => false,
      updateLinkHover: () => {},
      linkState: {},
    });
    pointer({ button: 0, pointerId: 1, preventDefault() {} });
    expect(f.local).toHaveBeenCalledExactlyOnceWith("\u001b[<0;4;2M");
    expect(f.routed).not.toHaveBeenCalled();
  });

  it("notifies empty DOM paste before filtering and preserves one composition commit", () => {
    const listeners = new Map<
      string,
      (event: Record<string, unknown>) => void
    >();
    const input = {
      value: "",
      addEventListener: (
        name: string,
        fn: (event: Record<string, unknown>) => void,
      ) => listeners.set(name, fn),
      removeEventListener() {},
    };
    const gestures = vi.fn();
    const keys = vi.fn();
    const payload = vi.fn();
    bindIme({
      bindOptions: {
        inputHandler: createInputHandler(),
        sendKeyInput: keys,
        onPasteGesture: gestures,
        sendPasteText: vi.fn(),
        sendPastePayloadFromDataTransfer: payload,
        getLastKeydownSeq: () => "",
        getLastKeydownSeqAt: () => 0,
        keydownBeforeinputDedupeMs: 80,
      },
      imeInput: input,
      imeState: { composing: false },
      cleanupCanvasFns: [],
      getWasmReady: () => true,
      getWasmHandle: () => 1,
      setPreedit() {},
      syncImeSelection() {},
    });
    listeners.get("paste")!({ preventDefault() {} });
    listeners.get("beforeinput")!({
      inputType: "insertFromPaste",
      preventDefault() {},
    });
    expect(gestures).toHaveBeenCalledTimes(2);
    expect(gestures.mock.invocationCallOrder[0]).toBeLessThan(
      payload.mock.invocationCallOrder[0]!,
    );
    listeners.get("compositionstart")!({});
    listeners.get("compositionend")!({ data: "é" });
    expect(keys).toHaveBeenCalledExactlyOnceWith("é");
  });
});
