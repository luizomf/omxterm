import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fontStyleCorrections } from "./restty-font-style-corrections.mjs";
import { syntheticBoldCorrections } from "./restty-synthetic-bold-corrections.mjs";
import { pointerCorrections } from "./restty-pointer-corrections.mjs";
import { backgroundCorrections } from "./restty-background-corrections.mjs";
import { blinkCorrections } from "./restty-blink-corrections.mjs";
import { bufferTextCorrections } from "./restty-buffer-text-corrections.mjs";
import {
  softWrapSpaceCorrections,
  visiblePathBoundaryCorrections,
} from "./restty-soft-wrap-corrections.mjs";
import {
  nativeDeadKeySpaceCorrections,
  spaceInputCorrections,
} from "./restty-space-input-corrections.mjs";

const require = createRequire(import.meta.url);
const entryPath = require.resolve("restty");
const packageDist = path.dirname(entryPath);
const runtimePath = path.join(packageDist, "chunk-c0rcpsc5.js");
const corePath = path.join(packageDist, "chunk-6dxqza9q.js");
const eventTypesPath = path.join(
  packageDist,
  "runtime/core/runtime-events.d.ts",
);
const correctedCorePath = path.resolve(
  import.meta.dirname,
  "../assets/restty/omxterm-restty-core.wasm",
);
const originalCoreDigest =
  "e7b41a730c6994748e02468d8b656fe9258cd15e801df3a6d859e3eb6b37c74a";
const priorCorrectedCoreDigest =
  "5a64d5de8f573ac2f392f8863ef6bbeb6228a57d267b8b4d73cf0694e221f56c";
const priorImageCoreDigest =
  "fb4ff0ec8463a634a54078f3970a3cef86c1be3a880ad1da70f4d9fd3e2b8411";
const priorInteractionCoreDigest =
  "4c0830a7b5dc3cb986de5c980315fc68d14ef33cc193a479b062fc54a7234159";
const priorResizeCoreDigest =
  "3b3f4ef21e2fe5d5bfc7d5ad47b2557c1e12cca33619dbd5f15df9572e038f4d";
const priorBackgroundCoreDigest =
  "039abfec307ab03015a2ae70b3583e07fcc9e5a70319de1ca055d6168f45af1b";
const priorGraphemeCoreDigest =
  "baa7dd9600c034a77e73ed03864c3e15e02ccdc591d2044479652fef1d9c0900";
const priorReflowCoreDigest =
  "dbe1edf4897f11d0de24acb4fd83d94646200a87a58317341525dc0a9d613662";
const correctedCoreDigest =
  "1fb03cc8360942c613ca98973658de362852a60d88942c482de4b0dc429660fa";
const correctedCoreWasmDigest =
  "92aa781340d4bd87f8028c17534fe720bd47e87dd34786d149811923e4e389ec";
const originalEventTypesDigest =
  "1c9383be2d0377635b3463a5ac2ec31eac3e2b233fc664de751ad3e9f54ea650";
const correctedEventTypesDigest =
  "428304b91fffa494abcda7e2ac96fc4d305db9906b1436f07650969840a2fa34";
const originalDigest =
  "e07e8d84898917de2b22b858602260a6dd921bbaf924526773f94fc38fbbaf9d";
const priorCorrectedDigest =
  "8f9620d4c39b9e88bb149010e8aad24b0c35073373c2d8a66d78466ccbafec2a";
const priorAppearanceDigest =
  "8de5f8d9e583852080932c739e6f059dcea01b0d84982d020746fb50636a0cdc";
const priorBoldColorDigest =
  "a0cd79e08164bde293ca4ee6b52ab1b71cc8959eb1da646f95dde52015aad270";
const priorFamilyFilterDigest =
  "ecba146c51073810b44d469c75a60ce12d62d0e7311b227c6d13d87da86af627";
const priorFontDigest =
  "23f4bf4377dfcc34b39f439f2e4865be41a65603e405ec08ebb1f3a467ada867";
const priorScrollbackDigest =
  "c8580ea08273aa17dc3ae1f658aafe8340114a751e2a36e09e933e3bcabb3bad";
const priorClipboardDigest =
  "272bfb31f240a8e45ec2c36e85858a0cfadec1e6fc9a7fd8a7efe70a2f350c94";
const priorVisibleLinksDigest =
  "595f72d3be87f0965dea3733180264768720f7cba0c7c35aad797e2a22689665";
const priorParsedEventsDigest =
  "ed0282ed0062fc23a8ac90d2173633129cdd88d706adabb5f0e06bf3ff73aa11";
const priorOutputSafetyDigest =
  "15ca6dc64c45c1f42a88337aec58367a5e69fc0889dfa92c305aa333cba2a651";
const splitTerminatorOutputSafetyDigest =
  "cfe2c967cc201689f4e1ca2a9231e9652ff5fce47d7671ab73dba78b2b5fa7ea";
const priorInteractionDigest =
  "ac05624abac2fddea9a38f3e29d26ebbde3f41484b86c0082ce5e3d5cb334e1f";
const reviewedInteractionDigest =
  "1cda40a3b3e5dfbda54a2dd5616277e3d337e6f964639f8edc6e3c0c892011c3";
const priorViewportDigest =
  "46031b070690dc8763b38182abe4cf5205e405e3bdeece179fb7fe00d654a344";
const priorFontMemoryDigest =
  "56dd27c2e2239c3660ccd79c93c3e4a4bfde0bc548ecce09e59c3af00982105c";
const priorDeadKeyCompositionDigest =
  "6a7b5297bf4f7a4509c9f64ad22a29c521b0c5f48882a4451872a335e0847ccd";
const priorModifiedHoverDigest =
  "f3434c66a9ef1ebe817f9debcb8ecf49f8477c4d481af2d6791c122967b2bee4";
const priorHiddenRenderingDigest =
  "e0d54804ec53ada4692691394852eb1f18e82a223283fe26e3ee2117ccd609ad";
const priorDepthDigest =
  "dafd11ff8e1dba44c5d9f1429b895c00cde2cdbe3d6c971db9938c046b18c0be";
const priorResizeDigest =
  "950e2ae1d104fbaea82189c6d1353bb05d61dbcbfee90a36961ab1287978c78a";
const priorFontStyleDigest =
  "b02420bb630dffb1e2b9cfe8bca076bc5eb79084d3c1038521513e2be5d7e06d";
const priorSyntheticBoldDigest =
  "76f43defb727e77a09274bf54bdf1d2473ee41d218fb6aa59bbdc6b165fe22cc";
const priorPointerDigest =
  "431ea06bb18273e35a5aa15aa56f61e3d27d79a16c36d66e56d73a29b0d6c4a8";
const priorSpaceInputDigest =
  "bd1907b75d7517684c128ec4ba6fbc8786e0a5f2960f87b7a8c5f28e09420880";
const priorNativeDeadKeySpaceDigest =
  "e29dbd7dd4bf559d186cda45629ab9727a43b37dee917eb0137d61e238c1d638";
const priorBackgroundDigest =
  "8a48d0ba974a4ef26ffcb3b5f2472fbd0cd28b7830d112e218b513014e15d662";
const priorScrollbarDigest =
  "19ce5c33221a7c77bea9eb83c49d9afb3ccda2a70636598492654db18226d0f2";
const priorCursorDigest =
  "940a722fb921e49fa308034002220b4105e5a64a0489e64c6ce2923bcad88f08";
const priorSoftWrapSpaceDigest =
  "3fb1a882bc75ee45e1f53370976d215bca7e1f7ba172696ee1985caa5e93d27b";
const priorVisiblePathBoundaryDigest =
  "62456e988c176b7a6f2a1ee90498b6f2b6b767d063e63b4826830d4663b771af";
const priorNativeScrollFeedbackDigest =
  "742a6d14c6906d6d4304199889eff69617f6a5ea25aaee788c2a7d6ee4e31dfa";
const priorBlinkDigest =
  "a5a31366381972750bf98651ac028e6bbe370e89d5ca5cc3855c141cd1002638";
const priorBufferTextDigest =
  "8ebccc2aa81d37266bbf4642e3e07e8c0b17e39935a97d8c3703eb9ac5e72649";
const correctedDigest =
  "3b1076d32880f0f28b8cbb465687825c4bb980d34d1af67862e23b5eda2871e3";

const nativeScrollFeedbackCorrections = [
  {
    original: "      spacer.style.height = `${currentScrollRangePx}px`;",
    corrected: `      const scrollTopBeforeSpacer = host.scrollTop;
      spacer.style.height = \`\${currentScrollRangePx}px\`;
      if (host.scrollTop !== scrollTopBeforeSpacer) ignoreNextScroll = true;`,
  },
];

const cursorCorrections = [
  {
    original: `        const offset = Math.floor((cursorThicknessPx + 1) / 2);
        pushRect(cursorData, x - offset, y, cursorThicknessPx, cellH, cursorColor);`,
    corrected: `        // Keep the font-derived bar thickness inside its addressed cell.
        pushRect(cursorData, x, y, cursorThicknessPx, cellH, cursorColor);`,
  },
  {
    original: `        const offset = Math.floor((cursorThicknessPx + 1) / 2);
        deps.pushRect(frame.cursorData, x - offset, y, cursorThicknessPx, cellH, cursorColor);`,
    corrected: `        // Keep both renderer emitters consistent at the first-column edge.
        deps.pushRect(frame.cursorData, x, y, cursorThicknessPx, cellH, cursorColor);`,
  },
];

const scrollbarCorrections = [
  {
    original: `  const nativeScrollHost = !hasCoarsePointer && !hasTouchPoints && typeof document !== "undefined" ? createNativeScrollbarHost({`,
    corrected: `  // Hybrid desktops still need native scrolling when a fine pointer is available.
  const hasFinePointer = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(any-pointer: fine)").matches;
  const nativeScrollHost = (hasFinePointer || !hasCoarsePointer && !hasTouchPoints) && typeof document !== "undefined" ? createNativeScrollbarHost({`,
  },
];

const resizeCorrections = [
  {
    original: `  return {
    clearScreen,
    sendInput
  };`,
    corrected: `  return {
    clearScreen,
    sendInput,
    flushWasmOutputToPty
  };`,
  },
  {
    original:
      "  const { sendInput, clearScreen } = createRuntimeControllerInput({",
    corrected:
      "  const { sendInput, clearScreen, flushWasmOutputToPty } = createRuntimeControllerInput({",
  },
  {
    original: `  return {
    sendInput,
    setOptionKeyMode,`,
    corrected: `  return {
    sendInput,
    flushWasmOutputToPty,
    setOptionKeyMode,`,
  },
  {
    original: `    ptyTransport,
    setNeedsRender: () => {
      needsRender = true;
    },
    markSearchDirty:`,
    corrected: `    ptyTransport,
    flushTerminalReplies: () => runtimeController.flushWasmOutputToPty(),
    setNeedsRender: () => {
      needsRender = true;
    },
    markSearchDirty:`,
  },
  {
    original: `    markSearchDirty,
    shapeClusterWithFont: textHelpers.shapeClusterWithFont`,
    corrected: `    markSearchDirty,
    flushTerminalReplies: options.flushTerminalReplies,
    shapeClusterWithFont: textHelpers.shapeClusterWithFont`,
  },
  {
    original: `    setNeedsRender();
  }
  function updateGrid() {`,
    corrected: `    // Deliver negotiated resize reports without waiting for further PTY output.
    options.flushTerminalReplies();
    setNeedsRender();
  }
  function updateGrid() {`,
  },
  {
    original:
      "      wasm.setPixelSize(wasmHandle, canvas.width, canvas.height);",
    corrected:
      "      wasm.setPixelSize(wasmHandle, cols * metrics.cellW, rows * metrics.cellH);",
  },
  {
    original: `    const canvas = options.getCanvas();
    shared.wasm.setPixelSize(shared.wasmHandle, canvas.width, canvas.height);
    writeToWasm(shared.wasmHandle, normalized);`,
    corrected: `    // Grid updates own pixel geometry; canvas remainder is not a terminal cell.
    writeToWasm(shared.wasmHandle, normalized);`,
  },
];

// The 2D renderer never enables depth testing; native evidence confirms that
// disabling depth removes the attachment without changing rendered pixels.
const depthCorrections = [
  {
    original:
      '  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });',
    corrected:
      '  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false });',
  },
];

const hiddenRenderingCorrections = [
  {
    original: `    canvas.width = nextWidth;
    canvas.height = nextHeight;
    deps.setCurrentDpr(dpr);`,
    corrected: `    // Forced grid refits must not reset an unchanged drawing buffer while
    // synchronized output deliberately retains its previous presentation.
    if (canvas.width !== nextWidth)
      canvas.width = nextWidth;
    if (canvas.height !== nextHeight)
      canvas.height = nextHeight;
    deps.setCurrentDpr(dpr);`,
  },
  {
    original: `  function updateGrid() {
    if (!fontState.fonts.length)`,
    corrected: `  function updateGrid() {
    // Initial hidden mounts need a core grid; later hidden font changes must
    // retain the last real grid until updateSize refits the visible canvas.
    if (gridState.cols > 0 && getCanvas().getBoundingClientRect().width <= 0)
      return;
    if (!fontState.fonts.length)`,
  },
  {
    original: `  function loop(state) {
    if (!options.internalState.paused) {`,
    corrected: `  function renderFrame(state, force = false) {
    if (!options.isSurfaceVisible()) {
      // Cached copies are disposable; the core retains valid hidden images.
      // Drop pending decodes too, so deletion never depends on a visible draw.
      options.clearKittyRenderCaches();
      return;
    }
    if (!options.internalState.paused) {`,
  },
  {
    original: `      if ((shared.needsRender || imageChanged) && renderBudget) {`,
    corrected: `      if ((shared.needsRender || imageChanged || force) && (renderBudget || force)) {`,
  },
  {
    original: `    options.internalState.rafId = requestAnimationFrame(() => loop(state));
  }
  return {
    loop
  };`,
    corrected: `  }
  function loop(state) {
    renderFrame(state);
    options.internalState.rafId = requestAnimationFrame(() => loop(state));
  }
  return {
    loop,
    refresh() {
      const shared = options.readState();
      if (shared.activeState && canRenderFrame(shared))
        renderFrame(shared.activeState, true);
    }
  };`,
  },
  {
    original: `  const { loop } = createRuntimeControllerRenderLoop({`,
    corrected: `  const { loop, refresh } = createRuntimeControllerRenderLoop({
    isSurfaceVisible: render.isSurfaceVisible,
    clearKittyRenderCaches: render.clearKittyRenderCaches,`,
  },
  {
    original: `    setScrollbackLines,
    createPublicApi:`,
    corrected: `    setScrollbackLines,
    refresh,
    createPublicApi:`,
  },
  {
    original: `      initialPreferredRenderer: terminal.renderer ?? "auto",`,
    corrected: `      isSurfaceVisible: terminal.isSurfaceVisible ?? (() => true),
      clearKittyRenderCaches: kittyRenderRuntime.clearKittyRenderCaches,
      initialPreferredRenderer: terminal.renderer ?? "auto",`,
  },
  {
    original: `    render: {
      setShaderStages,
      getShaderStages
    }`,
    corrected: `    render: {
      refresh: runtimeController.refresh,
      setShaderStages,
      getShaderStages
    }`,
  },
  {
    original: `    getBackend: () => internalState.backend,`,
    corrected: `    refresh: renderCapabilities.refresh,
    getBackend: () => internalState.backend,`,
  },
];
const digest = (source) => createHash("sha256").update(source).digest("hex");

const fontMemoryCorrections = [
  {
    original: `  let fontPromise = null;
  let fontLease = null;`,
    corrected: `  let fontPromise = null;
  let fontLease = null;
  let fontLoadEpoch = 0;`,
  },
  {
    original: `    configuredFonts = resolveFontInputs(fonts);
    fontPromise = null;`,
    corrected: `    configuredFonts = resolveFontInputs(fonts);
    fontLoadEpoch += 1;
    fontPromise = null;`,
  },
  {
    original: `    fontPromise = (async () => {
      let acquiredLease = null;`,
    corrected: `    const loadEpoch = fontLoadEpoch;
    fontPromise = (async () => {
      let acquiredLease = null;`,
  },
  {
    original: `        if (!acquiredLease.faces.length) {
          throw new Error("Unable to load any configured font source.");
        }
        releaseFontLease();`,
    corrected: `        // A closed/reconfigured runtime cannot adopt a late acquisition.
        if (loadEpoch !== fontLoadEpoch) {
          acquiredLease.release();
          acquiredLease = null;
          return;
        }
        if (!acquiredLease.faces.length) {
          throw new Error("Unable to load any configured font source.");
        }
        releaseFontLease();`,
  },
  {
    original: `      } catch (err) {
        if (acquiredLease) {
          acquiredLease.release();`,
    corrected: `      } catch (err) {
        if (loadEpoch !== fontLoadEpoch) {
          acquiredLease?.release();
          return;
        }
        if (acquiredLease) {
          acquiredLease.release();`,
  },
  {
    original: `  cleanupFns.push(() => {
    releaseFontLease();
    clearFontRuntimeState();`,
    corrected: `  cleanupFns.push(() => {
    fontLoadEpoch += 1;
    releaseFontLease();
    clearFontRuntimeState();`,
  },
  {
    original: `  const acquire = async (sources) => {
    const faces = [];
    const sourceRefs = new Map;
    for (let sourceIndex = 0;sourceIndex < sources.length; sourceIndex += 1) {`,
    corrected: `  const acquire = async (sources) => {
    const faces = [];
    const sourceRefs = new Map;
    const leaseId = nextLeaseId++;
    leaseSources.set(leaseId, sourceRefs);
    let completed = false;
    try {
    for (let sourceIndex = 0;sourceIndex < sources.length; sourceIndex += 1) {`,
  },
  {
    original: `      const baseLabel = sourceBaseLabel(source, sourceIndex);
      let buffer;`,
    corrected: `      const baseLabel = sourceBaseLabel(source, sourceIndex);
      // Pin before either load or parse can yield: pruning must not split
      // source bytes from parsed faces during this or a concurrent acquire.
      let sourceEntry = sourceCache.get(sourceKey);
      if (!sourceEntry) {
        sourceEntry = {
          key: sourceKey, buffer: null, byteLength: 0,
          loadedAt: now(), lastUsedAt: now(), failedAt: null, refCount: 0
        };
        sourceCache.set(sourceKey, sourceEntry);
      }
      sourceEntry.refCount += 1;
      sourceRefs.set(sourceKey, (sourceRefs.get(sourceKey) ?? 0) + 1);
      let buffer;`,
  },
  {
    original: `      const sourceEntry = sourceCache.get(sourceKey);
      if (sourceEntry) {
        sourceEntry.refCount += 1;
        sourceEntry.lastUsedAt = now();
      }
      sourceRefs.set(sourceKey, (sourceRefs.get(sourceKey) ?? 0) + 1);
      for (let faceIndex`,
    corrected: `      sourceEntry.lastUsedAt = now();
      for (let faceIndex`,
  },
  {
    original: `    const leaseId = nextLeaseId;
    nextLeaseId += 1;
    leaseSources.set(leaseId, sourceRefs);
    let released = false;`,
    corrected: `    completed = true;
    let released = false;`,
  },
  {
    original: `        releaseLease(leaseId);
      }
    };
  };
  return {
    acquire
  };`,
    corrected: `        releaseLease(leaseId);
      }
    };
    } finally {
      // A required-font failure must release every earlier reservation too.
      if (!completed) releaseLease(leaseId);
    }
  };
  return {
    acquire
  };`,
  },
];

const viewportCorrections = [
  {
    original: `    const rect = canvas.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.floor(rect.width * dpr));`,
    corrected: `    const rect = canvas.getBoundingClientRect();
    // Hidden tabs have no layout box; preserve their last real core/PTY grid.
    if (rect.width <= 0 || rect.height <= 0)
      return;
    const nextWidth = Math.max(1, Math.floor(rect.width * dpr));`,
  },
  {
    original: `    noteScrollActivity,
    scrollViewportByLines,`,
    corrected: `    noteScrollActivity,
    scrollToBottom: () => setViewportScrollOffset(Number.MAX_SAFE_INTEGER),
    scrollViewportByLines,`,
  },
  {
    original: `    syncScrollbar: scrollbarRuntime.syncScrollbar,
    bindCanvasEvents`,
    corrected: `    syncScrollbar: scrollbarRuntime.syncScrollbar,
    scrollToBottom: scrollbarRuntime.scrollToBottom,
    bindCanvasEvents`,
  },
  {
    original: `    selectAll: interaction.selectAll,
    selectWordAtClientPoint: interaction.selectWordAtClientPoint,`,
    corrected: `    selectAll: interaction.selectAll,
    scrollToBottom: interaction.scrollToBottom,
    selectWordAtClientPoint: interaction.selectWordAtClientPoint,`,
  },
];

const securityCorrections = [
  {
    original: `    onClipboardWrite: async (text) => {
      if (!text)
        return;
      await copyToClipboard2(text);
    },
    onClipboardRead: async () => {
      return await pasteFromClipboard2() ?? "";
    },`,
    corrected: `    // OMXTerm keeps direct browser clipboard access disabled.
    onClipboardWrite: void 0,
    onClipboardRead: void 0,`,
  },
  {
    original: `      keydownBeforeinputDedupeMs: KEYDOWN_BEFOREINPUT_DEDUPE_MS,
      openLink
`,
    corrected: `      keydownBeforeinputDedupeMs: KEYDOWN_BEFOREINPUT_DEDUPE_MS,
      // OMXTerm does not activate Restty links before its host route lands.
      openLink: () => {}
`,
  },
  {
    original: `        clearFontRuntimeState();
        console.error("font load error", err);
      }
`,
    corrected: `        clearFontRuntimeState();
        throw err;
      }
`,
  },
  {
    original: `  const { copySelectionToClipboard, pasteFromClipboard } = createRuntimeControllerClipboard({
    getSelectionText: hooks.getSelectionText,
    ptyInputRuntime: runtime.ptyInputRuntime
  });`,
    corrected: `  // OMXTerm owns clipboard actions through its typed host bridge.
  const copySelectionToClipboard = async () => false;
  const pasteFromClipboard = async () => false;`,
  },
];

const geometryCorrections = [
  {
    original:
      "  const size = Number.isFinite(fontSizePt) ? Math.max(10, Math.min(64, Math.round(fontSizePt))) : 18;",
    corrected:
      "  const size = Number.isFinite(fontSizePt) ? Math.max(1, Math.round(fontSizePt)) : 18;",
  },
  {
    original:
      "    const clamped = Math.max(10, Math.min(64, Math.round(value)));",
    corrected: "    const clamped = Math.max(1, Math.round(value));",
  },
  {
    original: `  const fontConfig = {
    sizePx: Number.isFinite(terminal.fontSize) ? Math.max(1, Math.round(terminal.fontSize)) : 18
  };`,
    corrected: `  const fontConfig = {
    sizePx: Number.isFinite(terminal.fontSize) ? Math.max(1, Math.round(terminal.fontSize)) : 18,
    lineHeightFactor: Number.isFinite(terminal.lineHeight) ? Math.max(1, Math.min(2, terminal.lineHeight)) : 1
  };`,
  },
  {
    original: `    const lineHeight = fontHeightUnits2(primary.font) * scale;
    const cellH = Math.max(1, Math.round(lineHeight));
    const baselineOffset = primary.font.ascender * scale;
    const yPad = Math.max(0, (cellH - lineHeight) * 0.5);
    return { cellW, cellH, fontSizePx, scale, lineHeight, baselineOffset, yPad };`,
    corrected: `    const lineHeight = fontHeightUnits2(primary.font) * scale;
    const cellH = Math.max(1, Math.round(lineHeight * fontConfig.lineHeightFactor));
    const baselineOffset = primary.font.ascender * scale;
    const yPad = Math.max(0, (cellH - lineHeight) * 0.5);
    return { cellW, cellH, fontSizePx, scale, lineHeight, baselineOffset, yPad };`,
  },
];

const fontCorrections = [
  {
    original: `        parsed.push({
          font: face,
          metadataLabel: info.fullName || info.family || info.postScriptName || undefined,
          index: info.index
        });`,
    corrected: `        parsed.push({
          font: face,
          metadataLabel: info.fullName || info.family || info.postScriptName || undefined,
          family: info.family,
          subfamily: info.subfamily,
          index: info.index
        });`,
  },
  {
    original: `      if (!parsedFaces.length)
        continue;
      const sourceEntry = sourceCache.get(sourceKey);`,
    corrected: `      if (!parsedFaces.length) {
        if (source.kind === "buffer" && source.weight === 400)
          throw new Error("required font decode failed");
        continue;
      }
      const collectionFaces = parsedFaces.filter((face) => face.family !== undefined);
      const familyFaces = collectionFaces.filter((face) => face.family === source.label);
      if (collectionFaces.length && source.kind === "buffer" && source.weight === 400 && !familyFaces.length)
        throw new Error("required font family mismatch");
      if (familyFaces.length) {
        const regularFaces = familyFaces.filter((face) => /^(regular|book|roman)$/iu.test(face.subfamily ?? ""));
        if (source.kind === "buffer" && source.weight === 400 && !regularFaces.length)
          throw new Error("required regular font face missing");
        parsedFaces = regularFaces.length ? regularFaces : familyFaces;
      }
      const sourceEntry = sourceCache.get(sourceKey);`,
  },
];

const requiredFontCorrections = [
  {
    original: `      if (!parsedFaces.length)
        continue;
      const familyFaces = parsedFaces.filter((face) => face.family === source.label);
      if (familyFaces.length) {
        const regularFaces = familyFaces.filter((face) => /^(regular|book|roman)$/iu.test(face.subfamily ?? ""));
        parsedFaces = regularFaces.length ? regularFaces : familyFaces;
      }
      const sourceEntry = sourceCache.get(sourceKey);`,
    corrected: fontCorrections[1].corrected,
  },
];

const boldColorCorrections = [
  {
    original: "  const BOLD_BRIGHTEN = 0.18;",
    corrected: "  const BOLD_BRIGHTEN = 0;",
  },
];

const scrollbackRuntimeCorrections = [
  {
    original: `    setFonts: terminalCapabilities.setFonts,
    applyTheme,`,
    corrected: `    setFonts: terminalCapabilities.setFonts,
    setScrollbackLines: terminalCapabilities.setScrollbackLines,
    applyTheme,`,
  },
  {
    original: `    internalState,
    maxScrollbackBytes,
    loop
  } = options;`,
    corrected: `    internalState,
    maxScrollbackBytes,
    scrollbackLines,
    loop
  } = options;`,
  },
  {
    original: `    internalState,
    maxScrollbackBytes,
    loop
  });`,
    corrected: `    internalState,
    maxScrollbackBytes,
    scrollbackLines,
    loop
  });`,
  },
  {
    original: `      const wasmHandle = instance.create(cols, rows, maxScrollbackBytes);
      if (!wasmHandle) {
        throw new Error("restty create failed (restty_create returned 0)");
      }`,
    corrected: `      const wasmHandle = instance.create(cols, rows, maxScrollbackBytes);
      if (!wasmHandle) {
        throw new Error("restty create failed (restty_create returned 0)");
      }
      instance.setScrollbackLimits(wasmHandle, scrollbackLines, maxScrollbackBytes);`,
  },
  {
    original: `  const maxScrollbackBytes = resolveMaxScrollbackBytes(lifecycleDeps);
  const { loop } =`,
    corrected: `  const maxScrollbackBytes = resolveMaxScrollbackBytes(lifecycleDeps);
  const scrollbackLines = Number.isInteger(lifecycleDeps.scrollbackLines) && lifecycleDeps.scrollbackLines >= 0 ? lifecycleDeps.scrollbackLines : 10000;
  const setScrollbackLines = (value) => {
    if (!Number.isInteger(value) || value < 0)
      throw new TypeError("scrollback lines must be a non-negative integer");
    const shared = state.readState();
    if (!shared.wasmReady || !shared.wasm || !shared.wasmHandle)
      return;
    shared.wasm.setScrollbackLimits(shared.wasmHandle, value, maxScrollbackBytes);
    state.writeState({ needsRender: true });
  };
  const { loop } =`,
  },
  {
    original: `    sendInput,
    createPublicApi:`,
    corrected: `    sendInput,
    setScrollbackLines,
    createPublicApi:`,
  },
  {
    original: `      maxScrollbackBytes: terminal.maxScrollbackBytes,
      maxScrollback: terminal.maxScrollback`,
    corrected: `      maxScrollbackBytes: terminal.maxScrollbackBytes,
      maxScrollback: terminal.maxScrollback,
      scrollbackLines: terminal.scrollbackLines`,
  },
  {
    original: `      setFontHintTarget,
      setFonts,
      resetTheme`,
    corrected: `      setFontHintTarget,
      setFonts,
      setScrollbackLines: runtimeController.setScrollbackLines,
      resetTheme`,
  },
];

const clipboardCorrections = [
  {
    original: `  clipboardRead;
  getDefaultColors;`,
    corrected: `  clipboardRead;
  oscHandler;
  getDefaultColors;`,
  },
  {
    original: `    this.clipboardRead = options.onClipboardRead;
    this.windowOpHandler = options.onWindowOp;`,
    corrected: `    this.clipboardRead = options.onClipboardRead;
    this.oscHandler = options.onOsc;
    this.windowOpHandler = options.onWindowOp;`,
  },
  {
    original: `      onClipboardRead: this.clipboardRead,
      onDesktopNotification: this.desktopNotificationHandler`,
    corrected: `      onClipboardRead: this.clipboardRead,
      onOsc: this.oscHandler,
      onDesktopNotification: this.desktopNotificationHandler`,
  },
  {
    original: `  if (code === "52") {
    const target = parts[1] ?? "c";`,
    corrected: `  if (code === "52") {
    if (handlers.onOsc) {
      const firstSep = content.indexOf(";");
      handlers.onOsc(52, firstSep < 0 ? "" : content.slice(firstSep + 1));
      return true;
    }
    const target = parts[1] ?? "c";`,
  },
  {
    original: `    onClipboardRead: options.onClipboardRead,
    onClipboardWrite: options.onClipboardWrite,
    onWindowOp: options.onWindowOp,`,
    corrected: `    onClipboardRead: options.onClipboardRead,
    onClipboardWrite: options.onClipboardWrite,
    onOsc: options.onOsc,
    onWindowOp: options.onWindowOp,`,
  },
  {
    original: `  function sendPasteText(text) {
    if (!text)
      return;
    const bracketedPasteEnabled = !!inputHandler.isBracketedPaste();
    sendKeyInput(formatPasteText(text, bracketedPasteEnabled));
  }`,
    corrected: `  function sendPasteText(text) {
    if (!text)
      return;
    const intercepted = runBeforeInputHook(text, "paste");
    if (!intercepted)
      return;
    if (shouldClearSelection())
      clearSelection();
    const payload = formatPasteText(intercepted, !!inputHandler.isBracketedPaste());
    if (ptyTransport.isConnected()) {
      ptyTransport.sendInput(payload);
      return;
    }
    sendInput(payload, "paste", { skipHooks: true });
  }`,
  },
  {
    original: `  clearScreen,
  terminalCapabilities
}) {`,
    corrected: `  clearScreen,
  terminalCapabilities,
  inputHandler
}) {`,
  },
  {
    original: `    setScrollbackLines: terminalCapabilities.setScrollbackLines,
    applyTheme,`,
    corrected: `    setScrollbackLines: terminalCapabilities.setScrollbackLines,
    isBracketedPasteEnabled: () => inputHandler.isBracketedPaste(),
    applyTheme,`,
  },
  {
    original: `  interactionCapabilities,
  copySelectionToClipboard,
  pasteFromClipboard
}) {`,
    corrected: `  interactionCapabilities,
  copySelectionToClipboard,
  pasteFromClipboard,
  getSelectionText
}) {`,
  },
  {
    original: `    copySelectionToClipboard,
    pasteFromClipboard,
    selectWordAtClientPoint: interaction.selectWordAtClientPoint,`,
    corrected: `    copySelectionToClipboard,
    pasteFromClipboard,
    getSelectionText,
    selectAll: interaction.selectAll,
    selectWordAtClientPoint: interaction.selectWordAtClientPoint,`,
  },
  {
    original: `  const selectWordAtClientPoint = (clientX, clientY) => {
    const cell = normalizeSelectionCell(positionToCell({ clientX, clientY }));
    return selectWordAtCell(cell);
  };`,
    corrected: `  const selectAll = () => {
    const renderState = getCurrentRenderState();
    const wasmExports = getWasmExports();
    const wasmHandle = getWasmHandle();
    if (!renderState || renderState.rows <= 0 || renderState.cols <= 0 || !wasmHandle)
      return false;
    const totalRows = wasmExports?.restty_scrollbar_total?.(wasmHandle) ?? renderState.rows;
    const viewportOffset = wasmExports?.restty_scrollbar_offset?.(wasmHandle) ?? 0;
    if (totalRows <= 0)
      return false;
    clearPendingDesktopSelection();
    selectionState.active = true;
    selectionState.dragging = false;
    selectionState.anchor = { row: -viewportOffset, col: 0 };
    selectionState.focus = { row: totalRows - viewportOffset - 1, col: renderState.cols - 1 };
    updateLinkHover(null);
    updateCanvasCursor();
    markNeedsRender();
    return true;
  };
  const selectWordAtClientPoint = (clientX, clientY) => {
    const cell = normalizeSelectionCell(positionToCell({ clientX, clientY }));
    return selectWordAtCell(cell);
  };`,
  },
  {
    original: `    positionToPixel,
    selectWordAtClientPoint,
    clearSelection,`,
    corrected: `    positionToPixel,
    selectAll,
    selectWordAtClientPoint,
    clearSelection,`,
  },
  {
    original: `      clearScreen: deps.clearScreen,
      terminalCapabilities: deps.publicApiCapabilities.terminal`,
    corrected: `      clearScreen: deps.clearScreen,
      terminalCapabilities: deps.publicApiCapabilities.terminal,
      inputHandler: deps.inputHandler`,
  },
  {
    original: `      copySelectionToClipboard: deps.copySelectionToClipboard,
      pasteFromClipboard: deps.pasteFromClipboard`,
    corrected: `      copySelectionToClipboard: deps.copySelectionToClipboard,
      pasteFromClipboard: deps.pasteFromClipboard,
      getSelectionText: deps.getSelectionText`,
  },
  {
    original: `  const copySelectionToClipboard = async () => false;
  const pasteFromClipboard = async () => false;`,
    corrected: `  const copySelectionToClipboard = async () => false;
  const pasteFromClipboard = async () => false;
  const getSelectionText = hooks.getSelectionText;`,
  },
  {
    original: `      copySelectionToClipboard,
      pasteFromClipboard,
      publicApiCapabilities`,
    corrected: `      copySelectionToClipboard,
      pasteFromClipboard,
      getSelectionText,
      publicApiCapabilities`,
  },
  {
    original: `    onClipboardWrite: void 0,
    onClipboardRead: void 0,`,
    corrected: `    onClipboardWrite: void 0,
    onClipboardRead: void 0,
    onOsc: services.onOsc,`,
  },
  {
    original: `        let j = i + 2;
        let terminatorLen = 0;
        while (j < data.length) {
          const code = data.charCodeAt(j);
          if (code === 7) {
            terminatorLen = 1;
            break;
          }
          if (code === 27 && j + 1 < data.length && data[j + 1] === "\\\\") {
            terminatorLen = 2;
            break;
          }
          j += 1;
        }
        if (!terminatorLen) {
          this.remainder = data.slice(i);
          break;
        }
        const seq = data.slice(i, j);
        this.observeOsc(seq);
        if (!this.handleOsc(seq)) {
          result += data.slice(i, j + terminatorLen);
        }
        i = j + terminatorLen;`,
    corrected: `        let j = i + 2;
        let terminatorLen = 0;
        let cancelled = false;
        while (j < data.length) {
          const code = data.charCodeAt(j);
          if (code === 7) {
            terminatorLen = 1;
            break;
          }
          if (code === 24 || code === 26) {
            terminatorLen = 1;
            cancelled = true;
            break;
          }
          if (code === 27 && j + 1 < data.length && data[j + 1] === "\\\\") {
            terminatorLen = 2;
            break;
          }
          j += 1;
        }
        if (!terminatorLen) {
          this.remainder = data.slice(i);
          break;
        }
        if (!cancelled) {
          const seq = data.slice(i, j);
          this.observeOsc(seq);
          if (!this.handleOsc(seq)) {
            result += data.slice(i, j + terminatorLen);
          }
        }
        i = j + terminatorLen;`,
  },
];

const visibleLinkCorrections = [
  {
    original: `function createRuntimeInteraction(options) {
  const {
    attachCanvasEvents,
    touchSelectionMode,
    touchSelectionLongPressMs,
    touchSelectionMoveThresholdPx,
    imeInput,
    cleanupCanvasFns,
    getCanvas,
    getCurrentDpr,
    getGridState,
    getLastRenderState,
    getWasmReady,
    getWasm,
    getWasmHandle,
    getWasmExports,
    updateLinkHover,`,
    corrected: `function createRuntimeInteraction(options) {
  const {
    attachCanvasEvents,
    touchSelectionMode,
    touchSelectionLongPressMs,
    touchSelectionMoveThresholdPx,
    imeInput,
    cleanupCanvasFns,
    getCanvas,
    getCurrentDpr,
    getGridState,
    getLastRenderState,
    getWasmReady,
    getWasm,
    getWasmHandle,
    getWasmExports,
    resolveVisibleLink,
    updateLinkHover,`,
  },
  {
    original: `  const clearSelection = () => {
    clearPendingDesktopSelection();`,
    corrected: `  const getVisibleLinkAtClientPoint = (clientX, clientY) => {
    if (!resolveVisibleLink)
      return null;
    const render = getCurrentRenderState();
    const wasm = getWasm();
    const wasmHandle = getWasmHandle();
    if (!render || !wasm || !wasmHandle || render.rows <= 0 || render.cols <= 0)
      return null;

    // Render-state views borrow WASM memory. Snapshot every cell before the
    // selection-text queries below allocate and may grow that memory.
    const rows = Array.from({ length: render.rows }, (_, row) =>
      Array.from({ length: render.cols }, (_, col) => {
        const idx = row * render.cols + col;
        const wide = render.wide?.[idx] ?? 0;
        return wide === 2 || wide === 3 ? "" : readClusterText(render, idx);
      }),
    );
    const rowText = rows.map((cells) => cells.join("").replace(/[ \\t]+$/gu, ""));
    for (let row = 0; row < render.rows; row += 1) {
      if (wasm.getSelectionText(wasmHandle, row, 0, row, render.cols - 1) !== rowText[row])
        return null;
    }
    const selectionRowText = (row) =>
      row >= 0 && row < render.rows
        ? rowText[row]
        : wasm.getSelectionText(wasmHandle, row, 0, row, render.cols - 1);
    const isSoftWrap = (firstRow, secondRow) => {
      const first = selectionRowText(firstRow);
      const second = selectionRowText(secondRow);
      const pair = wasm.getSelectionText(
        wasmHandle,
        firstRow,
        0,
        secondRow,
        render.cols - 1,
      );
      if (pair === first + second)
        return true;
      if (pair === first + "\\n" + second)
        return false;
      return null;
    };

    const cell = normalizeSelectionCell(positionToCell({ clientX, clientY }));
    let firstRow = cell.row;
    let lastRow = cell.row;
    while (firstRow > 0 && isSoftWrap(firstRow - 1, firstRow) === true)
      firstRow -= 1;
    while (lastRow + 1 < render.rows && isSoftWrap(lastRow, lastRow + 1) === true)
      lastRow += 1;
    const text = rowText.slice(firstRow, lastRow + 1).join("");
    const offset =
      rowText.slice(firstRow, cell.row).join("").length +
      rows[cell.row].slice(0, cell.col).join("").length;
    const wasmExports = getWasmExports();
    const viewportOffset = wasmExports?.restty_scrollbar_offset?.(wasmHandle) ?? 0;
    const viewportLength = wasmExports?.restty_scrollbar_len?.(wasmHandle) ?? render.rows;
    const totalRows = wasmExports?.restty_scrollbar_total?.(wasmHandle) ?? render.rows;
    const clippedStart =
      firstRow === 0 && viewportOffset > 0 && isSoftWrap(-1, 0) === true;
    const clippedEnd =
      lastRow === render.rows - 1 &&
      viewportOffset + viewportLength < totalRows &&
      (isSoftWrap(render.rows - 1, render.rows) === true ||
        rows[lastRow][render.cols - 1] !== " ");
    const match = resolveVisibleLink({ text, offset, clippedStart, clippedEnd });
    return match
      ? {
          ...match,
          id: \`\${viewportOffset}:\${firstRow}:\${match.start}:\${match.end}:\${match.url}\`
        }
      : null;
  };
  const clearSelection = () => {
    clearPendingDesktopSelection();`,
  },
  {
    original: `    positionToPixel,
    selectAll,`,
    corrected: `    positionToPixel,
    getVisibleLinkAtClientPoint,
    selectAll,`,
  },
  {
    original: `    getMouseStatus: () => inputHandler.getMouseStatus(),
    copySelectionToClipboard,`,
    corrected: `    getMouseStatus: () => inputHandler.getMouseStatus(),
    getVisibleLinkAtClientPoint: interaction.getVisibleLinkAtClientPoint,
    copySelectionToClipboard,`,
  },
  {
    original: `    getWasmExports: () => wasmExports,
    updateLinkHover,`,
    corrected: `    getWasmExports: () => wasmExports,
    resolveVisibleLink: services.resolveVisibleLink,
    updateLinkHover,`,
  },
];

const visibleHoverCorrections = [
  {
    original: `    const match = resolveVisibleLink({ text, offset, clippedStart, clippedEnd });
    return match
      ? {
          ...match,
          id: \`\${viewportOffset}:\${firstRow}:\${match.start}:\${match.end}:\${match.url}\`
        }
      : null;`,
    corrected: `    const match = resolveVisibleLink({ text, offset, clippedStart, clippedEnd });
    if (!match)
      return null;
    const cells = [];
    let textIndex = 0;
    for (let row = firstRow; row <= lastRow; row += 1) {
      let rowIndex = 0;
      for (let col = 0; col < render.cols && rowIndex < rowText[row].length; col += 1) {
        const cluster = rows[row][col];
        if (!cluster)
          continue;
        const clusterStart = textIndex + rowIndex;
        const clusterEnd = clusterStart + cluster.length;
        if (clusterStart < match.end && clusterEnd > match.start) {
          cells.push(row * render.cols + col);
          for (let trailing = col + 1; trailing < render.cols && rows[row][trailing] === ""; trailing += 1)
            cells.push(row * render.cols + trailing);
        }
        rowIndex += cluster.length;
      }
      textIndex += rowText[row].length;
    }
    return {
      ...match,
      cells,
      id: \`\${viewportOffset}:\${firstRow}:\${match.start}:\${match.end}:\${match.url}\`
    };`,
  },
  {
    original: `  const linkState = {
    hoverId: 0,
    hoverUri: ""
  };`,
    corrected: `  const linkState = {
    hoverId: 0,
    hoverUri: "",
    visibleHoverCells: new Set()
  };`,
  },
  {
    original: `  function updateLinkHover(cell) {`,
    corrected: `  function setVisibleLinkHover(cells) {
    const next = new Set(cells ?? []);
    if (next.size === linkState.visibleHoverCells.size &&
        [...next].every((cell) => linkState.visibleHoverCells.has(cell)))
      return;
    linkState.visibleHoverCells = next;
    needsRender = true;
  }
  function updateLinkHover(cell) {`,
  },
  {
    original: `      const linkHovered = linkId && linkId === linkState.hoverId;`,
    corrected: `      const linkHovered = linkId && linkId === linkState.hoverId;
      const visibleLinkHovered = linkState.visibleHoverCells.has(idx);`,
    occurrences: 2,
  },
  {
    original: `      if (!textHidden && !bgOnly) {`,
    corrected: `      if (visibleLinkHovered && !textHidden && !selectionState.dragging) {
        drawUnderlineStyle(underlineData, 1, x, rowY, cellW, cellH, baseY, underlineOffsetPx, underlineThicknessPx, fg);
      }
      if (!textHidden && !bgOnly) {`,
    occurrences: 2,
  },
  {
    original: `    getVisibleLinkAtClientPoint,
    selectAll,`,
    corrected: `    getVisibleLinkAtClientPoint,
    setVisibleLinkHover,
    selectAll,`,
  },
  {
    original: `    getVisibleLinkAtClientPoint: interaction.getVisibleLinkAtClientPoint,
    copySelectionToClipboard,`,
    corrected: `    getVisibleLinkAtClientPoint: interaction.getVisibleLinkAtClientPoint,
    setVisibleLinkHover: interaction.setVisibleLinkHover,
    copySelectionToClipboard,`,
  },
  {
    original: `    resolveVisibleLink,
    updateLinkHover,`,
    corrected: `    resolveVisibleLink,
    setVisibleLinkHover,
    updateLinkHover,`,
  },
  {
    original: `    resolveVisibleLink: services.resolveVisibleLink,
    updateLinkHover,`,
    corrected: `    resolveVisibleLink: services.resolveVisibleLink,
    setVisibleLinkHover,
    updateLinkHover,`,
  },
];

const parsedEventRuntimeCorrections = [
  {
    original: `    writeToWasm(shared.wasmHandle, normalized);
    flushWasmOutputToPty();`,
    corrected: `    writeToWasm(shared.wasmHandle, normalized);
    for (const event of shared.wasm.drainParsedEvents(shared.wasmHandle))
      options.emitRuntimeEvent(event);
    flushWasmOutputToPty();`,
  },
  {
    original: `    forwardTerminalReplies: runtime.forwardTerminalReplies,
    markSearchDirty: hooks.markSearchDirty,`,
    corrected: `    forwardTerminalReplies: runtime.forwardTerminalReplies,
    emitRuntimeEvent: options.runtimeEvents.emit,
    markSearchDirty: hooks.markSearchDirty,`,
  },
];

const outputSafetyCorrections = [
  {
    original: `class OutputFilter {
  remainder = "";
  getCursorPosition;`,
    corrected: `const MAX_RETAINED_CONTROL_CODE_UNITS = 1e7;
class OutputFilter {
  remainder = "";
  discardedControl = null;
  discardedOscEscape = false;
  getCursorPosition;`,
  },
  {
    original: `    let result = "";
    let i = 0;
    while (i < data.length) {
      const ch = data[i];`,
    corrected: `    let result = "";
    let i = 0;
    while (i < data.length) {
      const ch = data[i];
      const code = data.charCodeAt(i);
      if (this.discardedControl === "osc") {
        if (this.discardedOscEscape && ch === "\\\\") {
          this.discardedControl = null;
          this.discardedOscEscape = false;
        } else if (code === 7 || code === 24 || code === 26) {
          this.discardedControl = null;
          this.discardedOscEscape = false;
        } else {
          this.discardedOscEscape = code === 27;
        }
        i += 1;
        continue;
      }
      if (this.discardedControl === "csi") {
        if (code === 24 || code === 26 || code >= 64 && code <= 126)
          this.discardedControl = null;
        i += 1;
        continue;
      }`,
  },
  {
    original: `      if (data[i + 1] === "]") {
        let j = i + 2;
        let terminatorLen = 0;
        let cancelled = false;
        while (j < data.length) {
          const code = data.charCodeAt(j);`,
    corrected: `      if (data[i + 1] === "]") {
        let j = i + 2;
        let bodyStart = j;
        let terminatorLen = 0;
        let cancelled = false;
        while (j < data.length) {
          const code = data.charCodeAt(j);
          if (code === 59 && j - (i + 2) <= 16 && /^[0-9]+$/.test(data.slice(i + 2, j)))
            bodyStart = j + 1;`,
  },
  {
    original: `          if (code === 27 && j + 1 < data.length && data[j + 1] === "\\\\") {
            terminatorLen = 2;
            break;
          }
          j += 1;
        }
        if (!terminatorLen) {
          this.remainder = data.slice(i);
          break;
        }`,
    corrected: `          if (code === 27 && j + 1 < data.length && data[j + 1] === "\\\\") {
            terminatorLen = 2;
            break;
          }
          if (j - bodyStart >= MAX_RETAINED_CONTROL_CODE_UNITS) {
            if (code === 27 && j + 1 >= data.length) {
              j += 1;
              continue;
            }
            this.discardedControl = "osc";
            this.discardedOscEscape = false;
            break;
          }
          j += 1;
        }
        if (this.discardedControl === "osc") {
          i = j;
          continue;
        }
        if (!terminatorLen) {
          this.remainder = data.slice(i);
          break;
        }`,
  },
  {
    original: `      let j = i + 2;
      while (j < data.length) {
        const code = data.charCodeAt(j);
        if (code >= 64 && code <= 126)
          break;
        j += 1;
      }
      if (j >= data.length) {
        this.remainder = data.slice(i);
        break;
      }
      const seq = data.slice(i, j + 1);`,
    corrected: `      let j = i + 2;
      let cancelled = false;
      while (j < data.length) {
        const code = data.charCodeAt(j);
        if (code === 24 || code === 26) {
          cancelled = true;
          break;
        }
        if (code >= 64 && code <= 126)
          break;
        if (j - (i + 2) >= MAX_RETAINED_CONTROL_CODE_UNITS) {
          this.discardedControl = "csi";
          break;
        }
        j += 1;
      }
      if (this.discardedControl === "csi") {
        i = j;
        continue;
      }
      if (j >= data.length) {
        this.remainder = data.slice(i);
        break;
      }
      if (cancelled) {
        i = j + 1;
        continue;
      }
      const seq = data.slice(i, j + 1);`,
  },
];

const splitTerminatorOutputSafetyCorrections = [
  {
    original: `          if (j - bodyStart >= MAX_RETAINED_CONTROL_CODE_UNITS) {
            this.discardedControl = "osc";
            this.discardedOscEscape = false;
            break;
          }
          j += 1;`,
    corrected: `          if (j - bodyStart >= MAX_RETAINED_CONTROL_CODE_UNITS) {
            if (code === 27 && j + 1 >= data.length) {
              j += 1;
              continue;
            }
            this.discardedControl = "osc";
            this.discardedOscEscape = false;
            break;
          }
          j += 1;`,
  },
];

const interactionCorrections = [
  {
    original: `function attachRuntimeControllerKeyboardEvents(options) {
  const hasInputFocus = () => {`,
    corrected: `function attachRuntimeControllerKeyboardEvents(options) {
  let leftOptionDown = false;
  let rightOptionDown = false;
  const optionActsAsAlt = () => {
    const mode = options.getOptionKeyMode();
    return mode === "both" || mode === "left" && leftOptionDown || mode === "right" && rightOptionDown;
  };
  const updateOptionState = (event, down) => {
    if (event.code === "AltLeft") leftOptionDown = down;
    if (event.code === "AltRight") rightOptionDown = down;
  };
  const resetOptionState = () => {
    leftOptionDown = false;
    rightOptionDown = false;
  };
  const isNativeOptionText = (event) =>
    options.isMacPlatform && event.altKey && !event.ctrlKey && !event.metaKey && !optionActsAsAlt() && (event.key === "Dead" || event.key.length === 1);
  const configuredAltEvent = (event) => {
    if (!options.isMacPlatform || !event.altKey || !optionActsAsAlt() || event.key.length !== 1)
      return event;
    const base = deriveBaseLayoutCodepoint(event);
    const shifted = event.shiftKey ? SHIFTED_CODE_BY_CODE[event.code || ""] : undefined;
    const key = shifted || (base > 0 ? String.fromCodePoint(base) : event.key);
    return {
      key,
      code: event.code,
      type: event.type,
      repeat: event.repeat,
      isComposing: event.isComposing,
      altKey: true,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      getModifierState: (name) => event.getModifierState?.(name) ?? false
    };
  };
  const hasInputFocus = () => {`,
  },
  {
    original: `    if (target === options.imeInput) {
      if (options.interaction.imeState.composing || event.isComposing)
        return true;`,
    corrected: `    if (isNativeOptionText(event))
      return true;
    if (target === options.imeInput) {
      if (options.interaction.imeState.composing || event.isComposing)
        return true;`,
  },
  {
    original: `      if (!event.ctrlKey && !event.metaKey && event.key.length === 1 && !event.repeat) {
        return true;
      }`,
    corrected: `      if (!event.ctrlKey && !event.metaKey && event.key.length === 1 && !event.repeat && !(event.altKey && optionActsAsAlt())) {
        return true;
      }`,
  },
  {
    original: `  const onKeyDown = (event) => {
    if (isMacInputSourceShortcut(event)) {`,
    corrected: `  const onKeyDown = (event) => {
    updateOptionState(event, true);
    if (isMacInputSourceShortcut(event)) {`,
  },
  {
    original: `    const seq = options.inputHandler.encodeKeyEvent(event);
    if (seq) {
      if (event.type === "keydown" && ["Backspace", "Delete", "Del", "Enter"].includes(event.key)) {`,
    corrected: `    const effectiveEvent = configuredAltEvent(event);
    const seq = options.inputHandler.encodeKeyEvent(effectiveEvent);
    if (seq) {
      if (event.type === "keydown" && ["Backspace", "Delete", "Del", "Enter"].includes(event.key)) {`,
  },
  {
    original: `  const onKeyUp = (event) => {
    if (isMacInputSourceShortcut(event))
      return;`,
    corrected: `  const onKeyUp = (event) => {
    updateOptionState(event, false);
    if (isMacInputSourceShortcut(event))
      return;`,
  },
  {
    original: `    const seq = options.inputHandler.encodeKeyEvent(event);
    if (seq) {
      event.preventDefault();
      options.ptyInputRuntime.sendKeyInput(seq);
    }
  };
  window.addEventListener("keydown", onKeyDown);`,
    corrected: `    const seq = options.inputHandler.encodeKeyEvent(configuredAltEvent(event));
    if (seq) {
      event.preventDefault();
      options.ptyInputRuntime.sendKeyInput(seq);
    }
  };
  window.addEventListener("keydown", onKeyDown);`,
  },
  {
    original: `  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  options.cleanupFns.push(() => window.removeEventListener("keydown", onKeyDown));
  options.cleanupFns.push(() => window.removeEventListener("keyup", onKeyUp));`,
    corrected: `  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", resetOptionState);
  options.cleanupFns.push(() => window.removeEventListener("keydown", onKeyDown));
  options.cleanupFns.push(() => window.removeEventListener("keyup", onKeyUp));
  options.cleanupFns.push(() => window.removeEventListener("blur", resetOptionState));`,
  },
  {
    original: `  const scrollbackLines = Number.isInteger(lifecycleDeps.scrollbackLines) && lifecycleDeps.scrollbackLines >= 0 ? lifecycleDeps.scrollbackLines : 10000;
  const setScrollbackLines = (value) => {`,
    corrected: `  const scrollbackLines = Number.isInteger(lifecycleDeps.scrollbackLines) && lifecycleDeps.scrollbackLines >= 0 ? lifecycleDeps.scrollbackLines : 10000;
  let optionKeyMode = ["none", "left", "right", "both"].includes(platform.optionKeyMode) ? platform.optionKeyMode : "none";
  const setOptionKeyMode = (value) => {
    if (!["none", "left", "right", "both"].includes(value))
      throw new TypeError("option key mode must be none, left, right, or both");
    optionKeyMode = value;
  };
  const setScrollbackLines = (value) => {`,
  },
  {
    original: `      isMacPlatform: platform.isMacPlatform,
      inputHandler: runtime.inputHandler,`,
    corrected: `      isMacPlatform: platform.isMacPlatform,
      getOptionKeyMode: () => optionKeyMode,
      inputHandler: runtime.inputHandler,`,
  },
  {
    original: `    sendInput,
    setScrollbackLines,
    createPublicApi:`,
    corrected: `    sendInput,
    setOptionKeyMode,
    setScrollbackLines,
    createPublicApi:`,
  },
  {
    original: `    setFonts: terminalCapabilities.setFonts,
    setScrollbackLines: terminalCapabilities.setScrollbackLines,`,
    corrected: `    setFonts: terminalCapabilities.setFonts,
    setOptionKeyMode: terminalCapabilities.setOptionKeyMode,
    setScrollbackLines: terminalCapabilities.setScrollbackLines,`,
  },
  {
    original: `      imeInput,
      attachWindowEvents,
      isMacPlatform,`,
    corrected: `      imeInput,
      attachWindowEvents,
      isMacPlatform,
      optionKeyMode: terminal.optionKeyMode,`,
  },
  {
    original: `      setFonts,
      setScrollbackLines: runtimeController.setScrollbackLines,
      resetTheme`,
    corrected: `      setFonts,
      setOptionKeyMode: runtimeController.setOptionKeyMode,
      setScrollbackLines: runtimeController.setScrollbackLines,
      resetTheme`,
  },
  {
    original: `  if (isDeviceAttributesQuery(seq)) {
    handlers.sendReply("\\x1B[?1;2c");
    return true;
  }`,
    corrected: `  if (isDeviceAttributesQuery(seq)) {
    handlers.sendReply(seq.startsWith("\\x1B[>") ? "\\x1B[>0;0;0c" : "\\x1B[?1;2c");
    return true;
  }`,
  },
];

const interactionReviewCorrections = [
  {
    original: `  const configuredAltEvent = (event) => {
    if (!options.isMacPlatform || !event.altKey || !optionActsAsAlt() || event.key.length !== 1)
      return event;
    const base = deriveBaseLayoutCodepoint(event);
    const shifted = event.shiftKey ? SHIFTED_CODE_BY_CODE[event.code || ""] : undefined;
    const key = shifted || (base > 0 ? String.fromCodePoint(base) : event.key);`,
    corrected: `  const configuredAltEvent = (event) => {
    if (!options.isMacPlatform || !event.altKey || !optionActsAsAlt())
      return event;
    const base = deriveBaseLayoutCodepoint(event);
    const baseKey = base > 0 ? String.fromCodePoint(base) : event.key;
    const shifted = event.shiftKey ? SHIFTED_CODE_BY_CODE[event.code || ""] : undefined;
    const key = shifted || (event.shiftKey && /^[a-z]$/u.test(baseKey) ? baseKey.toUpperCase() : baseKey);
    if (key.length !== 1)
      return event;`,
  },
  {
    original: `    const key = event.key?.toLowerCase?.() ?? "";
    const hasPrimaryShortcutModifier = options.isMacPlatform ? event.metaKey : event.ctrlKey;
    const wantsCopy = hasPrimaryShortcutModifier && !event.altKey && (key === "c" || event.shiftKey && key === "c");
    const wantsPaste = hasPrimaryShortcutModifier && !event.altKey && (key === "v" || event.shiftKey && key === "v");
    if (wantsCopy && options.interaction.selectionState.active) {
      event.preventDefault();
      options.copySelectionToClipboard();
      return;
    }
    if (wantsPaste) {
      if (options.imeInput) {
        ensureImeInputFocus();
        return;
      }
      event.preventDefault();
      const seq = options.inputHandler.encodeKeyEvent(event);
      if (seq) {
        options.ptyInputRuntime.sendKeyInput(seq);
      }
      return;
    }
    const effectiveEvent = configuredAltEvent(event);`,
    corrected: `    // Application shortcuts are consumed in Electron main. Any key reaching
    // the Surface, including bare Ctrl+C/Ctrl+V, remains terminal input.
    const effectiveEvent = configuredAltEvent(event);`,
  },
];

const deadKeyCompositionCorrections = [
  {
    original: `    if (isNativeOptionText(event))
      return true;`,
    corrected: `    if (
      (event.key === "Dead" && !(event.altKey && optionActsAsAlt())) ||
      isNativeOptionText(event)
    )
      return true;`,
  },
];

const parsedEventTypeCorrections = [
  {
    original: `} | {
    type: "search-state";
    state: ResttySearchState;
};`,
    corrected: `} | {
    type: "search-state";
    state: ResttySearchState;
} | {
    type: "title";
    title: string;
} | {
    type: "bell";
};`,
  },
];

const coreRuntimeCorrections = [
  {
    original: `  "restty_resize",
  "restty_render_update",`,
    corrected: `  "restty_resize",
  "restty_set_scrollback_limits",
  "restty_event_ptr",
  "restty_event_len",
  "restty_event_consume",
  "restty_render_update",`,
  },
  {
    original: `  scrollViewport(handle, delta) {
    if (!this.exports.restty_scroll_viewport)
      return;
    this.exports.restty_scroll_viewport(handle, delta);
  }
  tickKittyAnimations`,
    corrected: `  scrollViewport(handle, delta) {
    if (!this.exports.restty_scroll_viewport)
      return;
    this.exports.restty_scroll_viewport(handle, delta);
  }
  setScrollbackLimits(handle, maxLines, maxBytes) {
    const status = this.exports.restty_set_scrollback_limits(handle, maxLines, maxBytes);
    if (status !== 0)
      throw new Error("Cannot update terminal scrollback limits");
  }
  tickKittyAnimations`,
  },
  {
    original: "var textDecoder = new TextDecoder;",
    corrected: `var textDecoder = new TextDecoder;
var eventTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true });`,
  },
  {
    original: `  getKittyKeyboardFlags(handle) {`,
    corrected: `  drainParsedEvents(handle) {
    const len = this.exports.restty_event_len(handle);
    if (!len)
      return [];
    const ptr = this.exports.restty_event_ptr(handle);
    if (!ptr)
      throw new Error("Cannot read parsed terminal events");
    const bytes = Uint8Array.from(new Uint8Array(this.memory.buffer, ptr, len));
    this.exports.restty_event_consume(handle, len);
    const events = [];
    for (let offset = 0; offset < bytes.length;) {
      const kind = bytes[offset++];
      if (kind === 1) {
        events.push({ type: "bell" });
        continue;
      }
      if (kind === 3) {
        events.push({ type: "title", title: "\\0".repeat(257) });
        continue;
      }
      if (kind !== 2 || offset + 4 > bytes.length)
        throw new Error("Invalid parsed terminal event");
      const titleLen = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
      offset += 4;
      if (offset + titleLen > bytes.length)
        throw new Error("Invalid parsed terminal title event");
      events.push({ type: "title", title: eventTextDecoder.decode(bytes.subarray(offset, offset + titleLen)) });
      offset += titleLen;
    }
    return events;
  }
  getKittyKeyboardFlags(handle) {`,
  },
];

const parsedEventCoreCorrections = [
  {
    original: `  "restty_set_scrollback_limits",
  "restty_render_update",`,
    corrected: `  "restty_set_scrollback_limits",
  "restty_event_ptr",
  "restty_event_len",
  "restty_event_consume",
  "restty_render_update",`,
  },
  coreRuntimeCorrections[2],
  coreRuntimeCorrections[3],
];

function applyCorrections(source, corrections) {
  for (const correction of corrections) {
    const expectedOccurrences = correction.occurrences ?? 1;
    const occurrences = source.split(correction.original).length - 1;
    if (occurrences !== expectedOccurrences)
      throw new Error(
        `Restty correction did not match reviewed source (${occurrences}): ${correction.original.slice(0, 80)}`,
      );
    source = source.replaceAll(correction.original, correction.corrected);
  }
  return source;
}

function encodeWasmBinary(bytes) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    const next = bytes[index + 1];
    if (byte === 0x5c) output += "\\\\";
    else if (byte === 0x60) output += "\\`";
    else if (byte === 0x24 && next === 0x7b) output += "\\$";
    else if (byte === 0x0a) output += "\\n";
    else if (byte === 0x0d) output += "\\r";
    else if (byte === 0x09) output += "\\t";
    else if (byte < 0x20 || byte === 0x7f || (byte >= 0x80 && byte <= 0x9f))
      output += `\\x${byte.toString(16).padStart(2, "0")}`;
    else output += String.fromCharCode(byte);
  }
  return output;
}

async function prepareResttyCore(selectedCorePath, selectedArtifactPath) {
  const core = await readFile(selectedArtifactPath);
  if (digest(core) !== correctedCoreWasmDigest)
    throw new Error("Restty core artifact failed its checksum");

  let source = await readFile(selectedCorePath, "utf8");
  const sourceDigest = digest(source);
  if (sourceDigest === correctedCoreDigest) return;
  if (
    sourceDigest !== originalCoreDigest &&
    sourceDigest !== priorCorrectedCoreDigest &&
    sourceDigest !== priorImageCoreDigest &&
    sourceDigest !== priorResizeCoreDigest &&
    sourceDigest !== priorBackgroundCoreDigest &&
    sourceDigest !== priorGraphemeCoreDigest &&
    sourceDigest !== priorReflowCoreDigest &&
    sourceDigest !== priorInteractionCoreDigest
  )
    throw new Error(
      "Unrecognized Restty WASM runtime; review the pinned OMXTerm corrections",
    );
  const match = /^var WASM_BINARY = `(?<binary>[\s\S]*?)`;$/mu.exec(source);
  if (!match?.groups?.binary)
    throw new Error("Restty embedded WASM input did not match reviewed source");
  source = source.replace(
    match[0],
    () => `var WASM_BINARY = \`${encodeWasmBinary(core)}\`;`,
  );
  source = applyCorrections(
    source,
    sourceDigest === originalCoreDigest
      ? coreRuntimeCorrections
      : sourceDigest === priorImageCoreDigest ||
          sourceDigest === priorResizeCoreDigest ||
          sourceDigest === priorBackgroundCoreDigest ||
          sourceDigest === priorGraphemeCoreDigest ||
          sourceDigest === priorReflowCoreDigest ||
          sourceDigest === priorInteractionCoreDigest
        ? []
        : parsedEventCoreCorrections,
  );
  if (digest(source) !== correctedCoreDigest)
    throw new Error(
      `Restty WASM correction did not produce reviewed bytes: ${digest(source)}`,
    );
  await writeFile(selectedCorePath, source);
}

async function prepareResttyEventTypes(selectedPath) {
  let source = await readFile(selectedPath, "utf8");
  const sourceDigest = digest(source);
  if (sourceDigest === correctedEventTypesDigest) return;
  if (sourceDigest !== originalEventTypesDigest)
    throw new Error(
      "Unrecognized Restty event types; review the pinned OMXTerm corrections",
    );
  source = applyCorrections(source, parsedEventTypeCorrections);
  if (digest(source) !== correctedEventTypesDigest)
    throw new Error(
      `Restty event type correction did not produce reviewed bytes: ${digest(source)}`,
    );
  await writeFile(selectedPath, source);
}

// Restty 0.3.0 otherwise reports readiness with an unusable font, exposes
// clipboard/link side effects before OMXTerm owns those routes, clamps live
// size to 10–64, has no independent row-height or live line-limit input,
// tags DOM paste as ordinary input, hides current paste mode, selection,
// parsed OSC, Select All and visible-cell/soft-wrap link lookup, and encodes
// native dead-key events before their composition commit in extended modes.
// It also brightens bold ANSI colors and expands
// every face in a collection without exact family/regular selection. Correct
// only the reviewed npm bytes;
// dependency drift requires a fresh review.
export async function prepareResttyRuntime(options = {}) {
  const selectedRuntimePath = options.runtimePath ?? runtimePath;
  const selectedCorePath = options.corePath ?? corePath;
  const selectedEventTypesPath = options.eventTypesPath ?? eventTypesPath;
  const selectedArtifactPath =
    options.correctedCorePath ??
    options.scrollbackCorePath ??
    correctedCorePath;
  let source = await readFile(selectedRuntimePath, "utf8");
  const sourceDigest = digest(source);
  if (sourceDigest !== correctedDigest) {
    // Intentional fallthrough: each reviewed input enters one ordered suffix.
    // Historical alternatives are handled at their stage, never in a second tail.
    switch (sourceDigest) {
      case originalDigest:
        source = applyCorrections(source, securityCorrections);
      case priorCorrectedDigest:
        source = applyCorrections(source, geometryCorrections);
      case priorAppearanceDigest:
        source = applyCorrections(source, boldColorCorrections);
      case priorBoldColorDigest:
        source = applyCorrections(source, fontCorrections);
      case priorFamilyFilterDigest:
        if (sourceDigest === priorFamilyFilterDigest)
          source = applyCorrections(source, requiredFontCorrections);
      case priorFontDigest:
        source = applyCorrections(source, scrollbackRuntimeCorrections);
      case priorScrollbackDigest:
        source = applyCorrections(source, clipboardCorrections);
      case priorClipboardDigest:
        // Original npm input already receives the current comments. Every older
        // corrected input through this stage still carries the opt-in wording.
        if (sourceDigest !== originalDigest)
          source = applyCorrections(source, [
            {
              original:
                "    // OMXTerm keeps candidate clipboard and OSC 52 integration disabled.",
              corrected:
                "    // OMXTerm keeps direct browser clipboard access disabled.",
            },
            {
              original:
                "  // OMXTerm exposes no candidate clipboard action before Protected Paste lands.",
              corrected:
                "  // OMXTerm owns clipboard actions through its typed host bridge.",
            },
          ]);
        if (sourceDigest === priorClipboardDigest)
          source = applyCorrections(source, [
            {
              original: `  const selectAll = () => {
    const renderState = getCurrentRenderState();
    if (!renderState || renderState.rows <= 0 || renderState.cols <= 0)
      return false;
    clearPendingDesktopSelection();
    selectionState.active = true;
    selectionState.dragging = false;
    selectionState.anchor = { row: 0, col: 0 };
    selectionState.focus = { row: renderState.rows - 1, col: renderState.cols - 1 };
    updateLinkHover(null);
    updateCanvasCursor();
    markNeedsRender();
    return true;
  };`,
              corrected: clipboardCorrections[10].corrected.split(
                "\n  const selectWordAtClientPoint",
              )[0],
            },
          ]);
      case priorVisibleLinksDigest:
        source = applyCorrections(source, visibleLinkCorrections);
      case priorParsedEventsDigest:
        source = applyCorrections(source, parsedEventRuntimeCorrections);
      case priorOutputSafetyDigest:
        source = applyCorrections(source, outputSafetyCorrections);
      case splitTerminatorOutputSafetyDigest:
        if (sourceDigest === splitTerminatorOutputSafetyDigest)
          source = applyCorrections(
            source,
            splitTerminatorOutputSafetyCorrections,
          );
      case priorInteractionDigest:
        source = applyCorrections(source, interactionCorrections);
      case reviewedInteractionDigest:
        source = applyCorrections(source, interactionReviewCorrections);
      case priorViewportDigest:
        source = applyCorrections(source, viewportCorrections);
      case priorFontMemoryDigest:
        source = applyCorrections(source, fontMemoryCorrections);
      case priorDeadKeyCompositionDigest:
        source = applyCorrections(source, deadKeyCompositionCorrections);
      case priorModifiedHoverDigest:
        source = applyCorrections(source, visibleHoverCorrections);
      case priorHiddenRenderingDigest:
        source = applyCorrections(source, hiddenRenderingCorrections);
      case priorDepthDigest:
        source = applyCorrections(source, depthCorrections);
      case priorResizeDigest:
        source = applyCorrections(source, resizeCorrections);
      case priorFontStyleDigest:
        source = applyCorrections(source, fontStyleCorrections);
      case priorSyntheticBoldDigest:
        source = applyCorrections(source, syntheticBoldCorrections);
      case priorPointerDigest:
        source = applyCorrections(source, pointerCorrections);
      case priorSpaceInputDigest:
        source = applyCorrections(source, spaceInputCorrections);
      case priorNativeDeadKeySpaceDigest:
        source = applyCorrections(source, nativeDeadKeySpaceCorrections);
      case priorBackgroundDigest:
        source = applyCorrections(source, backgroundCorrections);
      case priorScrollbarDigest:
        source = applyCorrections(source, scrollbarCorrections);
      case priorCursorDigest:
        source = applyCorrections(source, cursorCorrections);
      case priorSoftWrapSpaceDigest:
        source = applyCorrections(source, softWrapSpaceCorrections);
      case priorVisiblePathBoundaryDigest:
        source = applyCorrections(source, visiblePathBoundaryCorrections);
      case priorNativeScrollFeedbackDigest:
        source = applyCorrections(source, nativeScrollFeedbackCorrections);
      case priorBlinkDigest:
        source = applyCorrections(source, blinkCorrections);
      case priorBufferTextDigest:
        source = applyCorrections(source, bufferTextCorrections);
        break;
      default:
        throw new Error(
          "Unrecognized Restty runtime; review the pinned OMXTerm corrections",
        );
    }
    if (digest(source) !== correctedDigest)
      throw new Error(
        `Restty correction did not produce reviewed bytes: ${digest(source)}`,
      );
    await writeFile(selectedRuntimePath, source);
  }
  await prepareResttyCore(selectedCorePath, selectedArtifactPath);
  await prepareResttyEventTypes(selectedEventTypesPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await prepareResttyRuntime();
