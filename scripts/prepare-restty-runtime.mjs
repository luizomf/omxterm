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
const correctedDigest =
  "8f9620d4c39b9e88bb149010e8aad24b0c35073373c2d8a66d78466ccbafec2a";
const digest = (source) => createHash("sha256").update(source).digest("hex");

const corrections = [
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

// Restty 0.3.0 otherwise reports readiness with an unusable font and exposes
// clipboard/link side effects before OMXTerm owns those routes. Correct only
// the reviewed npm bytes; dependency drift requires a fresh review.
export async function prepareResttyRuntime() {
  let source = await readFile(runtimePath, "utf8");
  if (digest(source) === correctedDigest) return;
  if (digest(source) !== originalDigest)
    throw new Error(
      "Unrecognized Restty runtime; review the pinned OMXTerm corrections",
    );

  for (const correction of corrections) {
    const occurrences = source.split(correction.original).length - 1;
    if (occurrences !== 1)
      throw new Error("Restty correction did not match reviewed source");
    source = source.replace(correction.original, correction.corrected);
  }
  if (digest(source) !== correctedDigest)
    throw new Error("Restty correction did not produce reviewed bytes");
  await writeFile(runtimePath, source);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await prepareResttyRuntime();
