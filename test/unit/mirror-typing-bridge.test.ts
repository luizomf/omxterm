import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createMirrorTypingBridge } from "../../src/preload/mirror-typing-bridge";
import {
  isMirrorReply,
  mirrorTypingIpc,
  type MirrorCommand,
} from "../../src/shared/mirror-typing";

it("validates both admission phases and removes the exact command listener", () => {
  let deliver!: (event: unknown, value: unknown) => void;
  const ipc = {
    send: vi.fn(),
    on: vi.fn((_channel: string, listener: typeof deliver) => {
      deliver = listener;
    }),
    removeListener: vi.fn(),
  };
  const bridge = createMirrorTypingBridge(ipc);
  const receive = vi.fn<(command: MirrorCommand) => void>();
  const remove = bridge.onCommand(receive);
  const context = randomUUID();
  const request = randomUUID();
  const commands: MirrorCommand[] = [
    { kind: "capture", context, request },
    { kind: "describe", context, request },
    {
      kind: "prepare",
      context,
      request,
      handles: [randomUUID(), randomUUID()],
      sourceView: "hosted-view",
    },
    { kind: "handoff", context, request, prepared: randomUUID() },
    {
      kind: "activate",
      context,
      request,
      prepared: randomUUID(),
      lease: randomUUID(),
    },
    { kind: "stop", context, reason: "write-failed" },
    { kind: "retire", context },
  ];
  for (const command of commands) {
    deliver({}, command);
    deliver({}, { ...command, extra: true });
    deliver({}, { ...command, context: "foreign-shaped" });
  }
  expect(receive.mock.calls.map(([value]) => value)).toEqual(commands);
  remove();
  expect(ipc.removeListener).toHaveBeenCalledWith(
    mirrorTypingIpc.command,
    deliver,
  );
  bridge.reply({ request, ok: false, error: "need-two-panes" });
  expect(ipc.send).toHaveBeenLastCalledWith(mirrorTypingIpc.reply, {
    request,
    ok: false,
    error: "need-two-panes",
  });
  expect(
    isMirrorReply({ request, ok: false, error: "raw private exception" }),
  ).toBe(false);
  expect(isMirrorReply({ request, ok: true, error: "need-two-panes" })).toBe(
    false,
  );
});

it("refuses invalid/oversized input and unbounded stop metadata before IPC", () => {
  const ipc = { send: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
  const bridge = createMirrorTypingBridge(ipc);
  const input = {
    lease: randomUUID(),
    sequence: 1,
    sourceSessionId: "s1",
    data: "key",
  };
  bridge.input(input);
  expect(ipc.send).toHaveBeenCalledExactlyOnceWith(
    mirrorTypingIpc.input,
    input,
  );
  for (const invalid of [
    { ...input, sequence: 0 },
    { ...input, data: "x".repeat(65537) },
    { ...input, sourceSessionId: "arbitrary" },
  ])
    expect(() => bridge.input(invalid)).toThrow("Invalid mirror input");
  expect(() => bridge.stop("arbitrary", "stopped")).toThrow(
    "Invalid mirror stop",
  );
  expect(ipc.send).toHaveBeenCalledTimes(1);
});
