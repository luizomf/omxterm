// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type { SemanticInputCommand } from "../../src/shared/semantic-input";
import type { TerminalTabs } from "../../src/renderer/terminal-tabs";
import { englishLanguage } from "../../src/renderer/renderer-language";
import { subscribeToWindowTools } from "../../src/renderer/window-tool-subscriptions";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
});

function fixture() {
  let command!: (command: SemanticInputCommand) => void;
  let finish!: (delivered: boolean) => void;
  let focusContinuation: (() => void) | undefined;
  let blocked = false;
  let semanticBlocked = false;
  let foreground = true;
  let selected = true;
  const delivery = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const target = {
    live: () => true,
    isCurrent: () => true,
    focus: vi.fn(),
    deliver: vi.fn(),
    deliverAndReport: vi.fn(() => delivery),
    onUnavailable: () => () => {},
  };
  const tabs = {
    captureSnippetTarget: () => target,
    selectionRevision: () => 7,
    selectedSessionId: () => "s1",
    openOverlay: vi.fn(),
    focusSelected: vi.fn(),
  } as unknown as TerminalTabs;
  const focusTerminal = vi.fn((focus?: () => void) => {
    focusContinuation = focus;
  });
  const bridge = {
    selection() {},
    onCommand(listener: typeof command) {
      command = listener;
      return () => {};
    },
    reply: vi.fn(),
  };
  const tools = subscribeToWindowTools(
    document,
    { semanticInput: bridge },
    {
      tabs,
      panel: undefined,
      language: englishLanguage,
      blocked: () => blocked,
      semanticBlocked: () => semanticBlocked,
      onPreviewActivity() {},
      modalClipboard: () => false,
      focusTerminal,
      sourceForeground: () => foreground,
      sourceSelected: () => selected,
    },
  );
  cleanups.push(tools.unsubscribe, tools.preview.dispose);
  const act = () =>
    command({
      kind: "request",
      id: "11111111-1111-4111-8111-111111111111",
      source: "22222222-2222-4222-8222-222222222222",
      revision: 7,
      waitForDelivery: true,
      input: {
        operation: "terminal.semanticInput.v1",
        text: "'/file'",
        title: "File path",
        intent: "insert",
        preview: false,
      },
    });
  return {
    act,
    finish,
    target,
    focusTerminal,
    focus() {
      focusContinuation?.();
    },
    block() {
      blocked = true;
    },
    blockSemantic() {
      semanticBlocked = true;
    },
    switchSource() {
      foreground = false;
      selected = false;
    },
  };
}

it("refuses an insertion while presentation or an overlay blocks input", async () => {
  const f = fixture();
  f.block();
  f.act();
  await Promise.resolve();
  expect(f.target.deliverAndReport).not.toHaveBeenCalled();
  expect(f.focusTerminal).not.toHaveBeenCalled();
});

it("refuses semantic input during a pending native handoff", async () => {
  const f = fixture();
  f.blockSemantic();
  f.act();
  await Promise.resolve();
  expect(f.target.deliverAndReport).not.toHaveBeenCalled();
  expect(f.focusTerminal).not.toHaveBeenCalled();
});

it("does not hand focus away from a newer companion when delivery finishes", async () => {
  const f = fixture();
  f.act();
  f.switchSource();
  f.finish(true);
  await vi.waitFor(() =>
    expect(f.target.deliverAndReport).toHaveBeenCalledOnce(),
  );
  await Promise.resolve();
  expect(f.focusTerminal).not.toHaveBeenCalled();
  expect(f.target.focus).not.toHaveBeenCalled();
});

it("rechecks the captured source after the asynchronous native focus handoff", async () => {
  const f = fixture();
  f.act();
  f.finish(true);
  await vi.waitFor(() => expect(f.focusTerminal).toHaveBeenCalledOnce());
  f.switchSource();
  f.focus();
  expect(f.target.focus).not.toHaveBeenCalled();
});

it("focuses the captured terminal after a successful unchanged delivery", async () => {
  const f = fixture();
  f.act();
  f.finish(true);
  await vi.waitFor(() => expect(f.focusTerminal).toHaveBeenCalledOnce());
  f.focus();
  expect(f.target.focus).toHaveBeenCalledOnce();
});
