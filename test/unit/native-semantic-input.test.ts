// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { SnippetTarget } from "../../src/renderer/snippet-target";
import { createSemanticInput } from "../../src/renderer/semantic-input";
import { subscribeNativeSemanticInput } from "../../src/renderer/native-semantic-input";
import { createSemanticInputBridge } from "../../src/preload/semantic-input-bridge";
import {
  semanticInputIpc,
  type SemanticInputCommand,
} from "../../src/shared/semantic-input";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
});
const id = "11111111-1111-4111-8111-111111111111";
const source = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const request = (
  preview = false,
  intent: "insert" | "run" = "insert",
): SemanticInputCommand => ({
  kind: "request",
  id,
  source,
  revision: 7,
  input: {
    operation: "terminal.semanticInput.v1",
    text: "  $HOME\n\u0000",
    title: "Exact",
    intent,
    preview,
  },
});
function fixture() {
  const handlers = new Map<string, (event: unknown, value: unknown) => void>();
  const ipc = {
    send: vi.fn(),
    on: (channel: string, listener: (event: unknown, value: unknown) => void) =>
      handlers.set(channel, listener),
    removeListener: (channel: string) => handlers.delete(channel),
  };
  const bridge = createSemanticInputBridge(ipc);
  const target = {
    live: vi.fn(() => true),
    deliver: vi.fn(),
    onUnavailable: () => () => {},
  };
  const capture = vi.fn<() => SnippetTarget | undefined>(() => target);
  const focusTerminal = vi.fn();
  const overlays: { open(): void; refused?(): void }[] = [];
  const input = createSemanticInput(document, {
    capture,
    blocked: () => false,
    focusTerminal,
    onPreviewActivity: () => {},
    openOverlay: (open, refused) =>
      overlays.push({ open, ...(refused ? { refused } : {}) }),
  });
  const revision = vi.fn(() => 7);
  const restore = vi.fn(() => true);
  const dispose = subscribeNativeSemanticInput(
    bridge,
    input,
    revision,
    restore,
  );
  cleanups.push(dispose, input.preview.dispose);
  const command = (value: unknown) =>
    handlers.get(semanticInputIpc.command)?.({}, value);
  return {
    command,
    focusTerminal,
    ipc,
    target,
    capture,
    input,
    revision,
    overlays,
    restore,
    dispose,
  };
}
it("rejects a changed core selection in transit and malformed commands before capture", () => {
  const f = fixture();
  f.revision.mockReturnValue(8);
  f.command(request());
  f.command({ ...request(), revision: -1 });
  expect(f.capture).not.toHaveBeenCalled();
  expect(f.ipc.send).toHaveBeenCalledExactlyOnceWith(semanticInputIpc.reply, {
    kind: "finished",
    id,
    available: false,
  });
});
it.each([
  ["insert", "missing"],
  ["run", "missing"],
  ["insert", "ended"],
  ["run", "ended"],
] as const)(
  "reports unavailable %s for a %s target without transferring native focus",
  async (intent, state) => {
    const f = fixture();
    if (state === "missing") f.capture.mockReturnValue(undefined);
    else f.target.live.mockReturnValue(false);
    f.command(request(false, intent));
    await Promise.resolve();
    expect(f.capture).toHaveBeenCalledOnce();
    expect(f.target.deliver).not.toHaveBeenCalled();
    expect(f.focusTerminal).not.toHaveBeenCalled();
    expect(f.restore).not.toHaveBeenCalled();
    expect(f.ipc.send).toHaveBeenLastCalledWith(semanticInputIpc.reply, {
      kind: "finished",
      id,
      available: false,
    });
  },
);

it("captures once, preserves exact insert text, and leaves accepted delivery Surface-owned", async () => {
  const f = fixture();
  f.command(request());
  f.command(request());
  f.command({ kind: "revoke", id });
  await Promise.resolve();
  expect(f.capture).toHaveBeenCalledOnce();
  expect(f.target.deliver).toHaveBeenCalledExactlyOnceWith(
    "  $HOME\n\u0000",
    false,
  );
  expect(f.ipc.send).toHaveBeenLastCalledWith(semanticInputIpc.reply, {
    kind: "finished",
    id,
    available: true,
  });
});
it("keeps preview capture through native hiding, rejects overlap, and honors final Run once", async () => {
  const f = fixture();
  f.command(request(true));
  f.command({ ...request(true), id: other });
  const replacement = { ...f.target, deliver: vi.fn() };
  f.capture.mockReturnValue(replacement);
  f.revision.mockReturnValue(8);
  f.overlays[0]!.open();
  const button = document.querySelector<HTMLButtonElement>(
    ".snippet-preview-run",
  )!;
  button.click();
  button.click();
  await Promise.resolve();
  expect(f.capture).toHaveBeenCalledOnce();
  expect(f.target.deliver).toHaveBeenCalledExactlyOnceWith(
    "  $HOME\n\u0000",
    true,
  );
  expect(replacement.deliver).not.toHaveBeenCalled();
  expect(f.ipc.send).toHaveBeenCalledWith(semanticInputIpc.reply, {
    kind: "finished",
    id: other,
    available: false,
  });
});
it.each([false, true])(
  "revokes an unaccepted preview (opened=%s) without restoring a retired child",
  async (opened) => {
    const f = fixture();
    f.command(request(true));
    if (opened) f.overlays[0]!.open();
    f.command({ kind: "revoke", id });
    if (!opened) f.overlays[0]!.open();
    await Promise.resolve();
    expect(document.querySelector("dialog")).toBeNull();
    expect(f.target.deliver).not.toHaveBeenCalled();
    expect(f.restore).not.toHaveBeenCalled();
    expect(f.ipc.send).toHaveBeenLastCalledWith(semanticInputIpc.reply, {
      kind: "finished",
      id,
      available: false,
    });
  },
);
it("settles refused overlay admission and restores the source only on ordinary cancel", async () => {
  const f = fixture();
  f.command(request(true));
  f.overlays[0]!.refused!();
  await Promise.resolve();
  expect(f.ipc.send).toHaveBeenLastCalledWith(semanticInputIpc.reply, {
    kind: "finished",
    id,
    available: false,
  });
  f.command({ ...request(true), id: other });
  f.overlays[1]!.open();
  document.querySelector<HTMLButtonElement>(".snippet-preview-cancel")!.click();
  await Promise.resolve();
  expect(f.restore).toHaveBeenCalledExactlyOnceWith(source);
  expect(f.target.deliver).not.toHaveBeenCalled();
});
