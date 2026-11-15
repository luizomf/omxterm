// Chromium keeps at most 16 live WebGL contexts per renderer process and loses
// the oldest when one more is created (#1202). Every pane owns one, so a
// window with many tabs or splits lost sessions. release() gives a ready pane's
// context back right away (WEBGL_lose_context frees the slot, unlike dropping
// the canvas) and swaps in a fresh canvas; restore() builds a new context on it
// and resumes the loop. The core and its handle stay as they are, so no cell,
// scrollback or mode is touched. destroy() frees its context too, without
// waiting for garbage collection. While released, a hidden refresh still drops
// Kitty render copies, as it does with a context.
export const gpuReleaseCorrections = [
  {
    original: `    writeState({
      activeState: null,
      currentContextType: null,
      needsRender: false
    });
    for (const cleanup of cleanupCanvasFns)
      cleanup();
    cleanupCanvasFns.length = 0;
    for (const cleanup of cleanupFns)
      cleanup();
    cleanupFns.length = 0;
  }
  return {
    getLifecycleState: () => lifecycleState,
    init,
    destroy
  };`,
    corrected: `    if (activeState && "gl" in activeState)
      activeState.gl.getExtension("WEBGL_lose_context")?.loseContext();
    writeState({
      activeState: null,
      currentContextType: null,
      needsRender: false
    });
    for (const cleanup of cleanupCanvasFns)
      cleanup();
    cleanupCanvasFns.length = 0;
    for (const cleanup of cleanupFns)
      cleanup();
    cleanupFns.length = 0;
  }
  function releaseRenderer() {
    const shared = readState();
    if (lifecycleState !== "ready" || shared.currentContextType !== "webgl2" || !shared.activeState || !("gl" in shared.activeState))
      return false;
    cancelAnimationFrame(internalState.rafId);
    internalState.rafId = 0;
    clearTimeout(internalState.idleTimer);
    internalState.idleTimer = 0;
    const gl = shared.activeState.gl;
    replaceCanvas();
    internalState.backend = "none";
    writeState({ activeState: null, currentContextType: null });
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  }
  function restoreRenderer() {
    if (lifecycleState !== "ready")
      return false;
    if (readState().activeState)
      return true;
    const glState = initWebGL2(getCanvas());
    if (!glState)
      return false;
    internalState.backend = "webgl2";
    writeState({
      activeState: glState,
      currentContextType: "webgl2",
      needsRender: true
    });
    rebuildWebGLShaderStages(glState);
    setShaderStagesDirty(false);
    internalState.rafId = requestAnimationFrame(() => loop(glState));
    return true;
  }
  return {
    getLifecycleState: () => lifecycleState,
    init,
    destroy,
    releaseRenderer,
    restoreRenderer
  };`,
  },
  {
    // The native scroll host is built once around the first canvas, and the
    // swap's cleanup tears it down for good. Rebuild it around a new canvas.
    original: `  const nativeScrollHost = (hasFinePointer || !hasCoarsePointer && !hasTouchPoints) && typeof document !== "undefined" ? createNativeScrollbarHost({`,
    corrected: `  let hostCanvas = getCanvas();
  const createHost = () => (hasFinePointer || !hasCoarsePointer && !hasTouchPoints) && typeof document !== "undefined" ? createNativeScrollbarHost({`,
  },
  {
    original: `      setViewportScrollOffset(nextOffset);
    }
  }) : null;`,
    corrected: `      setViewportScrollOffset(nextOffset);
    }
  }) : null;
  let nativeScrollHost = createHost();`,
  },
  {
    original: `    destroy: () => {
      nativeScrollHost?.destroy();
    },`,
    corrected: `    destroy: () => {
      nativeScrollHost?.destroy();
    },
    attach: () => {
      if (hostCanvas === getCanvas())
        return false;
      nativeScrollHost?.destroy();
      hostCanvas = getCanvas();
      nativeScrollHost = createHost();
      return true;
    },`,
  },
  {
    original: `  const bindCanvasEvents = (bindOptions) => {
    if (!attachCanvasEvents)
      return;
    const canvas = getCanvas();`,
    corrected: `  const bindCanvasEvents = (bindOptions) => {
    if (!attachCanvasEvents)
      return;
    if (scrollbarRuntime.attach())
      cleanupCanvasFns.push(() => {
        scrollbarRuntime.destroy();
      });
    const canvas = getCanvas();`,
  },
  {
    // The native scroll host wraps the canvas and its cleanup unwraps it, so
    // the parent read before cleanup is stale by the swap (upstream only swaps
    // canvases when switching backends, which OMXTerm never did).
    original: `    const newCanvas = document.createElement("canvas");
    newCanvas.id = canvas.id;
    newCanvas.className = canvas.className;
    parent.replaceChild(newCanvas, canvas);`,
    corrected: `    const newCanvas = document.createElement("canvas");
    newCanvas.id = canvas.id;
    newCanvas.className = canvas.className;
    canvas.replaceWith(newCanvas);`,
  },
  {
    original: `    refresh() {
      const shared = options.readState();
      if (shared.activeState && canRenderFrame(shared))
        renderFrame(shared.activeState, true);
    }`,
    corrected: `    refresh() {
      const shared = options.readState();
      if ((shared.activeState || !options.isSurfaceVisible()) && canRenderFrame(shared))
        renderFrame(shared.activeState, true);
    }`,
  },
  {
    original: `    refresh,
    wakeRenderLoop,
    createPublicApi: (publicApiCapabilities) => createRuntimePublicApi({`,
    corrected: `    refresh,
    releaseRenderer: lifecycle.releaseRenderer,
    restoreRenderer: lifecycle.restoreRenderer,
    wakeRenderLoop,
    createPublicApi: (publicApiCapabilities) => createRuntimePublicApi({`,
  },
  {
    original: `    refresh: renderCapabilities.refresh,
    getBackend: () => internalState.backend,`,
    corrected: `    refresh: renderCapabilities.refresh,
    release: renderCapabilities.release,
    restore: renderCapabilities.restore,
    getBackend: () => internalState.backend,`,
  },
  {
    original: `    render: {
      refresh: runtimeController.refresh,
      setShaderStages,`,
    corrected: `    render: {
      refresh: runtimeController.refresh,
      release: runtimeController.releaseRenderer,
      restore: runtimeController.restoreRenderer,
      setShaderStages,`,
  },
];

// The managed pane keeps the canvas it was built with as its focus target
// (search close returns focus there). After a release swapped the canvas, focus
// follows the one in the pane (inside the native scroll host).
export const gpuReleaseSurfaceCorrection = {
  originalDigest:
    "a39c79b863a3992aab6e9276390a7e23b3f8659b91db2985c08a53b893e54cce",
  correctedDigest:
    "e93e09544f30a7ea5ef6f9c12f22790f6e53d283aeb9d3372159adf13b8888ef",
  original: `    container,
    focusTarget: canvas,
    runtime,`,
  corrected: `    container,
    get focusTarget() {
      return container.querySelector("canvas") ?? canvas;
    },
    runtime,`,
};
