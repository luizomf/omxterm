// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type { SnippetTarget } from "../../src/renderer/snippet-target";
import { createSemanticInput } from "../../src/renderer/semantic-input";
import { subscribeNativeSemanticInput } from "../../src/renderer/native-semantic-input";
import { createSemanticInputBridge } from "../../src/preload/semantic-input-bridge";
import {
  semanticInputIpc,
  type SemanticInputCommand,
} from "../../src/shared/semantic-input";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
});
const id = "11111111-1111-4111-8111-111111111111";
const source = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const request = (
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
    deliverAndReport: vi.fn(async () => true),
    onUnavailable: () => () => {},
  };
  const capture = vi.fn<() => SnippetTarget | undefined>(() => target);
  const focusTerminal = vi.fn();
  const input = createSemanticInput({
    capture,
    blocked: () => false,
    focusTerminal,
  });
  const revision = vi.fn(() => 7);
  const selectedSession = vi.fn<() => string | undefined>(() => "s1");
  const dispose = subscribeNativeSemanticInput(
    bridge,
    input,
    revision,
    selectedSession,
  );
  cleanups.push(dispose, input.dispose);
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
    selectedSession,
    dispose,
  };
}
it("confirms the exact renderer session and revision without transferring input", () => {
  const f = fixture();
  const command = {
    kind: "confirm-selection",
    id,
    revision: 7,
    sessionId: "s1",
  };
  f.command(command);
  expect(f.ipc.send).toHaveBeenLastCalledWith(semanticInputIpc.reply, {
    kind: "finished",
    id,
    available: true,
  });
  f.selectedSession.mockReturnValue("s2");
  f.command(command);
  expect(f.ipc.send).toHaveBeenLastCalledWith(semanticInputIpc.reply, {
    kind: "finished",
    id,
    available: false,
  });
  f.selectedSession.mockReturnValue("s1");
  f.revision.mockReturnValue(8);
  f.command(command);
  expect(f.ipc.send).toHaveBeenLastCalledWith(semanticInputIpc.reply, {
    kind: "finished",
    id,
    available: false,
  });
  expect(f.capture).not.toHaveBeenCalled();
});

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
    f.command(request(intent));
    await Promise.resolve();
    expect(f.capture).toHaveBeenCalledOnce();
    expect(f.target.deliver).not.toHaveBeenCalled();
    expect(f.focusTerminal).not.toHaveBeenCalled();
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
it("holds the native request until tracked Surface delivery finishes", async () => {
  const f = fixture();
  let finish!: (value: boolean) => void;
  const pending = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  f.target.deliverAndReport.mockImplementation(() => pending);
  f.command({ ...request(), waitForDelivery: true });
  expect(f.ipc.send).toHaveBeenLastCalledWith(semanticInputIpc.reply, {
    kind: "started",
    id,
  });
  f.command({ ...request(), id: other });
  expect(f.ipc.send).toHaveBeenLastCalledWith(semanticInputIpc.reply, {
    kind: "finished",
    id: other,
    available: false,
  });
  finish(true);
  await vi.waitFor(() =>
    expect(f.ipc.send).toHaveBeenLastCalledWith(semanticInputIpc.reply, {
      kind: "finished",
      id,
      available: true,
    }),
  );
});
