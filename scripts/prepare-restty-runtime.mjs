import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const entryPath = require.resolve("restty");
const packageDist = path.dirname(entryPath);
const runtimePath = path.join(packageDist, "chunk-c0rcpsc5.js");
const corePath = path.join(packageDist, "chunk-6dxqza9q.js");
const scrollbackCorePath = path.resolve(
  import.meta.dirname,
  "../assets/restty/omxterm-restty-core.wasm",
);
const originalCoreDigest =
  "e7b41a730c6994748e02468d8b656fe9258cd15e801df3a6d859e3eb6b37c74a";
const correctedCoreDigest =
  "5a64d5de8f573ac2f392f8863ef6bbeb6228a57d267b8b4d73cf0694e221f56c";
const correctedCoreWasmDigest =
  "64447381534a21b72e6e51cd88346a27eb8dc9e8b8c0a0f3973f9ce9babb81eb";
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
const correctedDigest =
  "c8580ea08273aa17dc3ae1f658aafe8340114a751e2a36e09e933e3bcabb3bad";
const digest = (source) => createHash("sha256").update(source).digest("hex");

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
    corrected: `    // OMXTerm keeps candidate clipboard and OSC 52 integration disabled.
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
    corrected: `  // OMXTerm exposes no candidate clipboard action before Protected Paste lands.
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

const scrollbackCoreCorrections = [
  {
    original: `  "restty_resize",
  "restty_render_update",`,
    corrected: `  "restty_resize",
  "restty_set_scrollback_limits",
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
];

function applyCorrections(source, corrections) {
  for (const correction of corrections) {
    const occurrences = source.split(correction.original).length - 1;
    if (occurrences !== 1)
      throw new Error(
        `Restty correction did not match reviewed source (${occurrences}): ${correction.original.slice(0, 80)}`,
      );
    source = source.replace(correction.original, correction.corrected);
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
    throw new Error("Restty scrollback core artifact failed its checksum");

  let source = await readFile(selectedCorePath, "utf8");
  const sourceDigest = digest(source);
  if (sourceDigest === correctedCoreDigest) return;
  if (sourceDigest !== originalCoreDigest)
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
  source = applyCorrections(source, scrollbackCoreCorrections);
  if (digest(source) !== correctedCoreDigest)
    throw new Error(
      `Restty WASM correction did not produce reviewed bytes: ${digest(source)}`,
    );
  await writeFile(selectedCorePath, source);
}

// Restty 0.3.0 otherwise reports readiness with an unusable font, exposes
// clipboard/link side effects before OMXTerm owns those routes, clamps live
// size to 10–64, has no independent row-height or live line-limit input,
// brightens bold ANSI colors, and expands every face in a collection without
// exact family/regular selection. Correct only the reviewed npm bytes;
// dependency drift requires a fresh review.
export async function prepareResttyRuntime(options = {}) {
  const selectedRuntimePath = options.runtimePath ?? runtimePath;
  const selectedCorePath = options.corePath ?? corePath;
  const selectedArtifactPath = options.scrollbackCorePath ?? scrollbackCorePath;
  let source = await readFile(selectedRuntimePath, "utf8");
  const sourceDigest = digest(source);
  if (sourceDigest !== correctedDigest) {
    if (sourceDigest === priorFontDigest) {
      // Only the scrollback runtime seam remains to be applied.
    } else if (sourceDigest === priorFamilyFilterDigest) {
      source = applyCorrections(source, requiredFontCorrections);
    } else if (sourceDigest === originalDigest) {
      source = applyCorrections(source, securityCorrections);
      source = applyCorrections(source, geometryCorrections);
    } else if (sourceDigest === priorCorrectedDigest) {
      source = applyCorrections(source, geometryCorrections);
    } else if (
      sourceDigest !== priorAppearanceDigest &&
      sourceDigest !== priorBoldColorDigest
    ) {
      throw new Error(
        "Unrecognized Restty runtime; review the pinned OMXTerm corrections",
      );
    }

    if (sourceDigest !== priorFontDigest) {
      if (sourceDigest !== priorFamilyFilterDigest) {
        if (sourceDigest !== priorBoldColorDigest)
          source = applyCorrections(source, boldColorCorrections);
        source = applyCorrections(source, fontCorrections);
      }
    }
    source = applyCorrections(source, scrollbackRuntimeCorrections);
    if (digest(source) !== correctedDigest)
      throw new Error(
        `Restty correction did not produce reviewed bytes: ${digest(source)}`,
      );
    await writeFile(selectedRuntimePath, source);
  }
  await prepareResttyCore(selectedCorePath, selectedArtifactPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await prepareResttyRuntime();
