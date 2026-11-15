import { describe, expect, it } from "vitest";
import { createRendererContextBudget } from "../../src/terminal-surface/renderer-context-budget";

function holder(name: string, released: string[]) {
  const state = { shown: false, canRelease: true };
  return {
    state,
    holder: {
      shown: () => state.shown,
      release: () => {
        if (!state.canRelease) return false;
        released.push(name);
        return true;
      },
    },
  };
}

describe("renderer context budget", () => {
  it("releases the hidden holders shown least recently once past the limit", () => {
    const released: string[] = [];
    const budget = createRendererContextBudget(2);
    const a = holder("a", released);
    const b = holder("b", released);
    const c = holder("c", released);
    const leaseA = budget.acquire(a.holder);
    budget.acquire(b.holder);
    expect(released).toEqual([]);

    // Showing a makes it the most recent; b is now the oldest.
    leaseA.use();
    budget.acquire(c.holder);
    expect(released).toEqual(["b"]);
  });

  it("never releases shown holders or ones still starting", () => {
    const released: string[] = [];
    const budget = createRendererContextBudget(1);
    const a = holder("a", released);
    const b = holder("b", released);
    const c = holder("c", released);
    a.state.shown = true;
    b.state.canRelease = false;
    budget.acquire(a.holder);
    const leaseB = budget.acquire(b.holder);
    budget.acquire(c.holder);
    // Over the limit, but only c could release, and it is the newest.
    expect(released).toEqual(["c"]);

    // Once b is ready, its next use settles the budget again; a stays.
    b.state.canRelease = true;
    leaseB.use();
    expect(released).toEqual(["c", "b"]);
  });

  it("frees the slot of a disposed lease and counts a released holder again once used", () => {
    const released: string[] = [];
    const budget = createRendererContextBudget(1);
    const a = holder("a", released);
    const b = holder("b", released);
    const leaseA = budget.acquire(a.holder);
    leaseA.dispose();
    const leaseB = budget.acquire(b.holder);
    expect(released).toEqual([]);

    // A disposed lease never comes back.
    leaseA.use();
    expect(released).toEqual([]);

    const c = holder("c", released);
    budget.acquire(c.holder);
    expect(released).toEqual(["b"]);
    // b is shown again: it restores and c, now the oldest hidden one, releases.
    b.state.shown = true;
    leaseB.use();
    expect(released).toEqual(["b", "c"]);
  });
});
