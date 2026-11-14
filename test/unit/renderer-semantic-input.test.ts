// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createSemanticInput } from "../../src/renderer/semantic-input";
import { snippetTarget } from "../../src/renderer/snippet-target";
import { createSemanticInputDelivery } from "../../src/terminal-surface/semantic-input-delivery";
import type { TerminalSurface } from "../../src/terminal-surface/terminal-surface";

const snippet = { name: "Exact", body: "  $HOME\n\u0000", execute: false };
function fixture() {
  const target = {
    live: () => true,
    deliver: vi.fn(),
    onUnavailable: () => () => {},
  };
  const capture = vi.fn(() => target);
  const focus = vi.fn();
  const input = createSemanticInput({
    capture,
    blocked: () => false,
    focusTerminal: focus,
  });
  return { input, target, capture, focus };
}
it("captures once and delivers exactly the snippet body", () => {
  const f = fixture();
  void f.input.request(snippet, "run");
  expect(f.capture).toHaveBeenCalledOnce();
  expect(f.target.deliver).toHaveBeenCalledExactlyOnceWith(snippet.body, true);
  expect(f.focus).toHaveBeenCalledOnce();
});
it("disposal revokes subsequent input", () => {
  const f = fixture();
  f.input.dispose();
  void f.input.request(snippet, "run");
  expect(f.capture).not.toHaveBeenCalled();
  expect(f.target.deliver).not.toHaveBeenCalled();
});
it("does not capture already revoked requests", () => {
  const f = fixture();
  void f.input.request(snippet, "run", AbortSignal.abort());
  expect(f.capture).not.toHaveBeenCalled();
  expect(f.target.deliver).not.toHaveBeenCalled();
});

it.each([true, false])(
  "waits for Surface delivery (delivered=%s) before focusing its captured target",
  async (delivered) => {
    let finish!: (value: boolean) => void;
    const pending = new Promise<boolean>((resolve) => {
      finish = resolve;
    });
    const target = {
      live: () => true,
      isCurrent: vi.fn(() => true),
      focus: vi.fn(),
      deliver: vi.fn(),
      deliverAndReport: vi.fn(() => pending),
      onUnavailable: () => () => {},
    };
    const focusCapturedTarget = vi.fn();
    const input = createSemanticInput({
      capture: () => target,
      blocked: () => false,
      focusTerminal: vi.fn(),
      focusCapturedTarget,
    });
    const result = input.request(snippet, "insert", undefined, true);
    expect(target.deliverAndReport).toHaveBeenCalledExactlyOnceWith(
      snippet.body,
    );
    expect(focusCapturedTarget).not.toHaveBeenCalled();
    finish(delivered);
    await expect(result).resolves.toBe(delivered);
    expect(focusCapturedTarget).toHaveBeenCalledTimes(delivered ? 1 : 0);
    if (delivered) expect(focusCapturedTarget).toHaveBeenCalledWith(target);
  },
);

it("keeps accepted tracked Protected Paste Surface-owned after extension retirement", async () => {
  let approve!: (value: boolean) => void;
  const confirmPaste = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        approve = resolve;
      }),
  );
  const write = vi.fn();
  const writeTracked = vi.fn(async () => "accepted" as const);
  const delivery = createSemanticInputDelivery({
    isLive: () => true,
    isBracketedPasteEnabled: () => false,
    confirmPaste,
    write,
    writeTracked,
  });
  const surface = {
    injectTracked: (text: string) => delivery.deliverTracked(text),
  } as TerminalSurface;
  const target = snippetTarget(
    {
      removed: false,
      ended: false,
      snippetTargetListeners: new Set(),
      surface,
    },
    () => true,
  )!;
  const focus = vi.fn();
  const input = createSemanticInput({
    capture: () => target,
    blocked: () => false,
    focusTerminal: vi.fn(),
    focusCapturedTarget: focus,
  });
  const extension = new AbortController();
  const outcome = input.request(snippet, "insert", extension.signal, true);
  await vi.waitFor(() => expect(confirmPaste).toHaveBeenCalledOnce());
  extension.abort();
  approve(true);
  await expect(outcome).resolves.toBe(true);
  expect(writeTracked).toHaveBeenCalledExactlyOnceWith(snippet.body);
  expect(write).not.toHaveBeenCalled();
  expect(focus).not.toHaveBeenCalled();
});

it("never focuses a replacement after a pending delivery or revocation", async () => {
  let finish!: (value: boolean) => void;
  const pending = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const target = {
    live: () => true,
    isCurrent: vi.fn(() => true),
    deliver: vi.fn(),
    deliverAndReport: vi.fn(() => pending),
    onUnavailable: () => () => {},
  };
  const focus = vi.fn();
  const input = createSemanticInput({
    capture: () => target,
    blocked: () => false,
    focusTerminal: vi.fn(),
    focusCapturedTarget: focus,
  });
  const controller = new AbortController();
  const result = input.request(snippet, "insert", controller.signal, true);
  target.isCurrent.mockReturnValue(false);
  controller.abort();
  finish(true);
  await expect(result).resolves.toBe(true);
  expect(focus).not.toHaveBeenCalled();
  expect(target.deliverAndReport).toHaveBeenCalledOnce();
});
