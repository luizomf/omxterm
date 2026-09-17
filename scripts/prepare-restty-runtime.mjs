import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const entryPath = require.resolve("restty");
const runtimePath = path.join(path.dirname(entryPath), "chunk-c0rcpsc5.js");
const originalDigest =
  "e07e8d84898917de2b22b858602260a6dd921bbaf924526773f94fc38fbbaf9d";
const priorCorrectedDigest =
  "8f9620d4c39b9e88bb149010e8aad24b0c35073373c2d8a66d78466ccbafec2a";
const priorAppearanceDigest =
  "8de5f8d9e583852080932c739e6f059dcea01b0d84982d020746fb50636a0cdc";
const correctedDigest =
  "a0cd79e08164bde293ca4ee6b52ab1b71cc8959eb1da646f95dde52015aad270";
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

const boldColorCorrections = [
  {
    original: "  const BOLD_BRIGHTEN = 0.18;",
    corrected: "  const BOLD_BRIGHTEN = 0;",
  },
];

function applyCorrections(source, corrections) {
  for (const correction of corrections) {
    const occurrences = source.split(correction.original).length - 1;
    if (occurrences !== 1)
      throw new Error("Restty correction did not match reviewed source");
    source = source.replace(correction.original, correction.corrected);
  }
  return source;
}

// Restty 0.3.0 otherwise reports readiness with an unusable font, exposes
// clipboard/link side effects before OMXTerm owns those routes, clamps live
// size to 10–64, has no independent row-height input, and brightens bold ANSI
// colors. Correct only the reviewed npm bytes; dependency drift requires a
// fresh review.
export async function prepareResttyRuntime() {
  let source = await readFile(runtimePath, "utf8");
  const sourceDigest = digest(source);
  if (sourceDigest === correctedDigest) return;
  if (sourceDigest === originalDigest) {
    source = applyCorrections(source, securityCorrections);
    source = applyCorrections(source, geometryCorrections);
  } else if (sourceDigest === priorCorrectedDigest) {
    source = applyCorrections(source, geometryCorrections);
  } else if (sourceDigest !== priorAppearanceDigest) {
    throw new Error(
      "Unrecognized Restty runtime; review the pinned OMXTerm corrections",
    );
  }

  source = applyCorrections(source, boldColorCorrections);
  if (digest(source) !== correctedDigest)
    throw new Error("Restty correction did not produce reviewed bytes");
  await writeFile(runtimePath, source);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await prepareResttyRuntime();
