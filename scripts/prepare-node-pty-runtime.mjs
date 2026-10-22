import { prepareNodePtyExecStatus } from "./prepare-node-pty-exec-status.mjs";
import { createHash } from "node:crypto";
import { chmod as chmodFile, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const defaultUnixRuntimePath = path.join(
  path.dirname(require.resolve("node-pty")),
  "unixTerminal.js",
);
const defaultWindowsRuntimePath = path.join(
  path.dirname(require.resolve("node-pty")),
  "windowsPtyAgent.js",
);
const originalWindowsRuntimeDigest =
  "8636d16b38266112204061a22b135734177c242837982fd3a4055be726efa64a";
const correctedWindowsRuntimeDigest =
  "3f4cf11eaa6cc07bacb34e3693857e123e3e55edfb446d7657d80cf95f9ce244";
const originalUnixRuntimeDigest =
  "a62e3a60c3bc1b0e7261f58284856df748dcee6761a2bc7a5a5ba98b22660473";
const correctedUnixRuntimeDigest =
  "238f993db4aa83d57885832eabe9c1de1ce05b96c84d3270574f26f71f9afcb8";
const foregroundUnixRuntimeDigest =
  "89fafa225fe39a4fc7d2af373cf9381684a3b2bfe7aa5df073247eb3b91040cc";
const digest = (source) => createHash("sha256").update(source).digest("hex");

const SUPPORTED_UNIX_ARCHITECTURES = ["arm64", "x64"];
const darwinHelperPath = (arch) =>
  path.resolve(
    import.meta.dirname,
    `../node_modules/node-pty/prebuilds/darwin-${arch}/spawn-helper`,
  );

async function prepareUnixRuntime(runtimePath) {
  let source = (await readFile(runtimePath, "utf8"))
    .replace(
      "var onexit = function (code, signal, execFailed)",
      "var onexit = function (code, signal)",
    )
    .replaceAll(
      "_this.emit('exit', code, signal, execFailed)",
      "_this.emit('exit', code, signal)",
    );
  const sourceDigest = digest(source);
  if (sourceDigest === foregroundUnixRuntimeDigest) {
    await writeFile(runtimePath, forwardExecStatus(source));
    return;
  }
  if (sourceDigest === correctedUnixRuntimeDigest) {
    await writeFile(
      runtimePath,
      forwardExecStatus(preserveUnavailableForeground(source)),
    );
    return;
  }
  if (sourceDigest !== originalUnixRuntimeDigest)
    throw new Error(
      "Unrecognized node-pty Unix runtime; review the pinned output correction",
    );
  const original = `                var timeout_1 = setTimeout(function () {
                    timeout_1 = null;
                    // Destroying the socket now will cause the close event to fire
                    _this._socket.destroy();
                }, DESTROY_SOCKET_TIMEOUT_MS);`;
  const corrected = `                // OMXTerm pauses this stream for renderer backpressure. Do not let
                // node-pty's Unix stuck-close guard discard readable tail bytes while
                // that owned pause is active; owner loss resumes before termination.
                var destroySocket_1 = function () {
                    if (_this._socket.isPaused()) {
                        timeout_1 = setTimeout(destroySocket_1, DESTROY_SOCKET_TIMEOUT_MS);
                        return;
                    }
                    timeout_1 = null;
                    // Destroying the socket now will cause the close event to fire
                    _this._socket.destroy();
                };
                var timeout_1 = setTimeout(destroySocket_1, DESTROY_SOCKET_TIMEOUT_MS);`;
  if (source.split(original).length - 1 !== 1)
    throw new Error("node-pty Unix correction did not match reviewed source");
  source = source.replace(original, corrected);
  if (digest(source) !== correctedUnixRuntimeDigest)
    throw new Error(
      `node-pty Unix correction did not produce reviewed bytes: ${digest(source)}`,
    );
  await writeFile(
    runtimePath,
    forwardExecStatus(preserveUnavailableForeground(source)),
  );
}

function preserveUnavailableForeground(source) {
  const original =
    "            return pty.process(this._fd, this._pty) || this._file;";
  const corrected = `            // OMXTerm keeps unavailable Linux foreground reads unavailable (ADR 0017).
            return pty.process(this._fd, this._pty);`;
  if (source.split(original).length - 1 !== 1)
    throw new Error(
      "node-pty foreground correction did not match reviewed source",
    );
  source = source.replace(original, corrected);
  if (digest(source) !== foregroundUnixRuntimeDigest)
    throw new Error(
      "node-pty foreground correction did not produce reviewed bytes",
    );
  return source;
}

async function preserveLiteralWindowsArguments(runtimePath) {
  let source = await readFile(runtimePath, "utf8");
  const sourceDigest = digest(source);
  if (sourceDigest === correctedWindowsRuntimeDigest) return;
  if (sourceDigest !== originalWindowsRuntimeDigest)
    throw new Error(
      "Unrecognized node-pty Windows runtime; review the pinned argv correction",
    );
  const original = `        // if it is empty or it contains whitespace and is not already quoted
        var hasLopsidedEnclosingQuote = xOr((arg[0] !== '"'), (arg[arg.length - 1] !== '"'));
        var hasNoEnclosingQuotes = ((arg[0] !== '"') && (arg[arg.length - 1] !== '"'));
        var quote = arg === '' ||
            (arg.indexOf(' ') !== -1 ||
                arg.indexOf('\\t') !== -1) &&
                ((arg.length > 1) &&
                    (hasLopsidedEnclosingQuote || hasNoEnclosingQuotes));`;
  const corrected = `        // Array entries are literal argv, including any enclosing quotation marks.
        var quote = arg === '' || arg.indexOf(' ') !== -1 || arg.indexOf('\\t') !== -1;`;
  if (source.split(original).length - 1 !== 1)
    throw new Error(
      "node-pty Windows correction did not match reviewed source",
    );
  source = source.replace(original, corrected);
  if (digest(source) !== correctedWindowsRuntimeDigest)
    throw new Error(
      "node-pty Windows correction did not produce reviewed bytes",
    );
  await writeFile(runtimePath, source);
}

function forwardExecStatus(source) {
  return source
    .replace(
      "var onexit = function (code, signal)",
      "var onexit = function (code, signal, execFailed)",
    )
    .replaceAll(
      "_this.emit('exit', code, signal)",
      "_this.emit('exit', code, signal, execFailed)",
    );
}

export async function prepareNodePtyRuntime({
  platform = process.platform,
  arch = process.arch,
  helperPath,
  unixRuntimePath = defaultUnixRuntimePath,
  windowsRuntimePath = defaultWindowsRuntimePath,
  rebuild = prepareNodePtyExecStatus,
  chmod = chmodFile,
} = {}) {
  if (platform === "win32") {
    await preserveLiteralWindowsArguments(windowsRuntimePath);
    return "corrected";
  }
  await prepareUnixRuntime(unixRuntimePath);
  // Both 64-bit architectures need the exec-status build: without it a native
  // exec failure would look like an ordinary exit code 1 (ADR 0032).
  if (!SUPPORTED_UNIX_ARCHITECTURES.includes(arch)) return "corrected";
  if (platform === "linux") {
    await rebuild();
    return "corrected-and-rebuilt";
  }
  if (platform === "darwin") {
    await rebuild();
    await chmod(helperPath ?? darwinHelperPath(arch), 0o755);
    return "corrected-and-rebuilt";
  }
  return "corrected";
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) await prepareNodePtyRuntime();
