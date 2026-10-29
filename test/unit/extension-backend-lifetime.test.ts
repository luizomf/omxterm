import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { active } from "../fixtures/extension-runtime-controlled";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
it.each(["stop", "disconnect", "exit"])(
  "revokes backend lifetime synchronously on %s before stream settlement",
  async (cause) => {
    const f = await active();
    const revoked = vi.fn();
    f.backend.signal.addEventListener("abort", revoked);
    expect(f.backend.signal.aborted).toBe(false);
    if (cause === "stop") void f.backend.retire();
    if (cause === "disconnect") f.child.lost();
    if (cause === "exit") f.child.exit(1, null);
    expect(f.backend.signal.aborted).toBe(true);
    expect(revoked).toHaveBeenCalledTimes(1);
    const retirement = f.runtime.dispose();
    if (cause !== "exit") f.child.exit(0, null);
    f.child.close();
    expect(await retirement).toMatchObject([{ settled: true }]);
    expect(revoked).toHaveBeenCalledTimes(1);
  },
);
