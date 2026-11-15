// Chromium keeps at most 16 live WebGL contexts per renderer process and loses
// the oldest one when another is created (#1202). Each window is its own
// renderer, and every Terminal Surface in it owns one context while it draws.
// A window host shares one budget among its Surfaces to stay under that cap: when a Surface needs a
// context and the window is over budget, the hidden Surfaces shown least
// recently give theirs back first. Shown Surfaces always keep theirs, and the
// slack above the budget covers Surfaces still starting.
export const LIVE_RENDERER_CONTEXTS = 12;

export interface RendererContextHolder {
  // Whether the Surface has a layout box; only Surfaces without one release.
  readonly shown: () => boolean;
  // Gives the context back; false when it can't right now (still starting).
  readonly release: () => boolean;
}

export interface RendererContextLease {
  // Call before creating or restoring the context, and whenever the Surface is
  // shown: it becomes the most recent and others release past the budget.
  use(): void;
  dispose(): void;
}

export interface RendererContextBudget {
  acquire(holder: RendererContextHolder): RendererContextLease;
}

export function createRendererContextBudget(
  limit = LIVE_RENDERER_CONTEXTS,
): RendererContextBudget {
  // Live holders, least recently used first.
  const live: RendererContextHolder[] = [];
  const settle = () => {
    for (const holder of [...live]) {
      if (live.length <= limit) return;
      if (holder.shown() || !holder.release()) continue;
      const index = live.indexOf(holder);
      if (index >= 0) live.splice(index, 1);
    }
  };
  return {
    acquire(holder: RendererContextHolder): RendererContextLease {
      let disposed = false;
      const lease = {
        use() {
          if (disposed) return;
          const index = live.indexOf(holder);
          if (index >= 0) live.splice(index, 1);
          live.push(holder);
          settle();
        },
        dispose() {
          disposed = true;
          const index = live.indexOf(holder);
          if (index >= 0) live.splice(index, 1);
        },
      };
      lease.use();
      return lease;
    },
  };
}
