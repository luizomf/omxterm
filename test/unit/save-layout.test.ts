import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { activate } from "../../extensions/restoration/backend";
import type { Value } from "../../src/extension-runtime/protocol";
import { StateError } from "../../src/extension-runtime/state";
import { saveWindowLayout } from "../../src/main/save-layout";
import { savedLayout } from "../fixtures/restoration-layout";

// Saved Layout's real backend over an in-memory state document.
function backend(initial: Value = null) {
  let current = { revision: "absent", value: initial };
  const state = {
    read: vi.fn(async () => current),
    replace: vi.fn(async (expected: string, value: Value) => {
      if (expected !== current.revision) throw new StateError("conflict");
      current = { revision: randomUUID(), value };
      return current;
    }),
  };
  const extension = activate({ signal: new AbortController().signal, state });
  const call = vi.fn((value: Value, signal: AbortSignal) =>
    extension.invoke(value, signal),
  );
  return { state, call, saved: () => current.value };
}
const signal = () => new AbortController().signal;

it("captures the window and replaces the saved layout at the revision it read", async () => {
  const old = savedLayout();
  old.savedAt = "2026-01-01T00:00:00.000Z";
  const f = backend(old as unknown as Value);
  const layout = savedLayout();
  const capture = vi.fn(async () => layout);
  expect(await saveWindowLayout(capture, f.call, signal())).toBe("saved");
  expect(capture).toHaveBeenCalledOnce();
  expect(f.state.replace).toHaveBeenCalledExactlyOnceWith("absent", layout);
  expect(f.saved()).toEqual(layout);
});

it("writes nothing when the capture fails or isn't a layout", async () => {
  for (const capture of [
    vi.fn(() => Promise.reject(new Error("no terminal tab"))),
    vi.fn(async () => ({ tabs: [] }) as never),
  ]) {
    const f = backend();
    expect(await saveWindowLayout(capture, f.call, signal())).toBe("failed");
    expect(f.state.replace).not.toHaveBeenCalled();
  }
});

it("reports a refusal as failed, without retrying", async () => {
  const f = backend();
  f.state.replace.mockRejectedValueOnce(new StateError("conflict"));
  expect(
    await saveWindowLayout(async () => savedLayout(), f.call, signal()),
  ).toBe("failed");
  expect(f.state.replace).toHaveBeenCalledOnce();
  expect(f.saved()).toBeNull();
});

it("never reports an uncertain write as saved", async () => {
  const unknown = backend();
  unknown.state.replace.mockRejectedValueOnce(new Error("disk went away"));
  const lost = backend();
  lost.call.mockImplementation(async (value) => {
    if ((value as { operation: string }).operation === "replace")
      throw new Error("backend exited");
    return { ok: true, revision: "absent", status: "empty", value: null };
  });
  for (const f of [unknown, lost])
    expect(
      await saveWindowLayout(async () => savedLayout(), f.call, signal()),
    ).toBe("unknown");
  expect(unknown.state.replace).toHaveBeenCalledOnce();
});

it("doesn't write when the saved state can't be read", async () => {
  const f = backend();
  f.state.read.mockRejectedValueOnce(new StateError("invalid-state"));
  expect(
    await saveWindowLayout(async () => savedLayout(), f.call, signal()),
  ).toBe("failed");
  expect(f.state.replace).not.toHaveBeenCalled();
});
