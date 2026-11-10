// The pinned loop requests a frame on every vsync, even for an unchanged
// screen. A quiet Surface now leaves vsync and sleeps until the next blink
// phase, polling at most every IDLE_POLL_MS for state that changes without an
// invalidation (reveal, pause, Kitty animation deadlines). Every needsRender
// write wakes the loop on the next frame, so output and input keep their
// latency and a missed wake costs one poll, never a frozen screen.
export const idleRenderCorrections = [
  {
    original: `    rafId: 0,
    nextBlinkTime`,
    corrected: `    rafId: 0,
    idleTimer: 0,
    nextBlinkTime`,
  },
  {
    original: `      options.clearKittyRenderCaches();
      return;
    }
    if (!options.internalState.paused) {
      const now = performance.now();
      if (now >= options.internalState.nextBlinkTime) {`,
    corrected: `      options.clearKittyRenderCaches();
      return false;
    }
    // Requested work keeps the loop on vsync; a blink phase alone does not.
    let active = false;
    if (!options.internalState.paused) {
      const now = performance.now();
      active = options.readState().needsRender;
      if (now >= options.internalState.nextBlinkTime) {`,
  },
  {
    original: `          options.writeState({ lastRenderTime: now, needsRender: false });
        }
      }
    }
  }
  function loop(state) {
    renderFrame(state);
    options.internalState.rafId = requestAnimationFrame(() => loop(state));
  }
  return {
    loop,
    refresh() {`,
    corrected: `          options.writeState({ lastRenderTime: now, needsRender: false });
        }
      }
      // Resize settling, animation and deferred presentation keep vsync too.
      active ||= resizeActive || imageChanged || options.readState().needsRender;
    }
    return active;
  }
  const IDLE_AFTER_MS = 500;
  const IDLE_POLL_MS = 250;
  let lastActiveAt = -Infinity;
  let idleState = null;
  function loop(state) {
    options.internalState.rafId = 0;
    const now = performance.now();
    if (renderFrame(state))
      lastActiveAt = now;
    if (now - lastActiveAt < IDLE_AFTER_MS) {
      options.internalState.rafId = requestAnimationFrame(() => loop(state));
      return;
    }
    const untilBlink = options.internalState.nextBlinkTime - now;
    idleState = state;
    options.internalState.idleTimer = setTimeout(wake, untilBlink > 0 ? Math.min(untilBlink, IDLE_POLL_MS) : IDLE_POLL_MS);
  }
  // Only a sleeping loop is resumed; lifecycle cancellation clears idleTimer.
  function wake() {
    if (!options.internalState.idleTimer)
      return;
    clearTimeout(options.internalState.idleTimer);
    options.internalState.idleTimer = 0;
    const state = idleState;
    idleState = null;
    options.internalState.rafId = requestAnimationFrame(() => loop(state));
  }
  return {
    loop,
    wake,
    refresh() {`,
  },
  {
    original: "  const { loop, refresh } = createRuntimeControllerRenderLoop({",
    corrected:
      "  const { loop, wake: wakeRenderLoop, refresh } = createRuntimeControllerRenderLoop({",
  },
  {
    original: `    setScrollbackLines,
    refresh,
    createPublicApi:`,
    corrected: `    setScrollbackLines,
    refresh,
    wakeRenderLoop,
    createPublicApi:`,
  },
  {
    original: `      cancelAnimationFrame(internalState.rafId);
      updateSize();`,
    corrected: `      cancelAnimationFrame(internalState.rafId);
      clearTimeout(internalState.idleTimer);
      internalState.idleTimer = 0;
      updateSize();`,
  },
  {
    original: `    cancelAnimationFrame(internalState.rafId);
    internalState.backend = "none";`,
    corrected: `    cancelAnimationFrame(internalState.rafId);
    clearTimeout(internalState.idleTimer);
    internalState.idleTimer = 0;
    internalState.backend = "none";`,
  },
  // Before invalidateRender exists: its own body performs this write.
  {
    original: "  needsRender = true;",
    corrected: "  invalidateRender();",
    occurrences: 14,
  },
  {
    original: `  let runtimeController = null;
`,
    corrected: `  let runtimeController = null;
  // Every invalidation wakes a sleeping render loop.
  function invalidateRender() {
    needsRender = true;
    runtimeController?.wakeRenderLoop();
  }
`,
  },
  {
    original: "    markNeedsRender: () => needsRender = true,",
    corrected: "    markNeedsRender: invalidateRender,",
  },
  {
    original: `      lastKeydownSeqAt = lastKeydownSeqAt
    } = patch);
  };`,
    corrected: `      lastKeydownSeqAt = lastKeydownSeqAt
    } = patch);
    if (patch.needsRender)
      runtimeController?.wakeRenderLoop();
  };`,
  },
];
