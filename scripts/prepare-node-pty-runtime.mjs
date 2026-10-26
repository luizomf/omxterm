import { prepareNodePtyExecStatus } from "./prepare-node-pty-exec-status.mjs";
import { createHash } from "node:crypto";
import {
  chmod as chmodFile,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
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
const defaultNodePtyRoot = path.dirname(
  require.resolve("node-pty/package.json"),
);
const originalWindowsRuntimeDigest =
  "b7a03bcfa8d2f6cc766ece18757154e0356f6cc558be29f6f8a86f62ba872e38";
const correctedWindowsRuntimeDigest =
  "6042a70008684243efbc865d2615c22a16a910c7a65475bc1a33e49447bcd815";
const originalUnixRuntimeDigest =
  "40a38f89259c42450a519682b2267493345adf32d78b0160dfc8f75e6ece2d3c";
const correctedUnixRuntimeDigest =
  "e3dbb7aeb8018d428f8d395ac1cadc1c85b8f17548862e284c22e02a7f106e2d";
const foregroundUnixRuntimeDigest =
  "7c31a3faeee52ad6f76d36a103ebbf47a1512dda567c90cdcb2bf78e6231a885";
const finalUnixRuntimeDigest =
  "a8ee8107e9d1a26c133e6d450149d2712facce0e97db12b57500e869bbab6578";

// Exact unmodified official beta.18 archive artifacts, not local Windows builds.
const windowsNativeDigests = {
  arm64: {
    "conpty.node":
      "308bebfe7811c45383ea21a67bb53d332ce6c7d46c41fc74e0417727874ce85d",
    "conpty_console_list.node":
      "ad254f30cd4709ddf256bf4d05ee27a0e2d4381deb44c3c2cc9b29fbeca16383",
    "conpty/conpty.dll":
      "b3a9f975c51d5b9b96d290bf784e990e3f85203b063c21614457353f566266ff",
    "conpty/OpenConsole.exe":
      "7fa560be0c9b6c81db5d1b855a4a6e0f3ee5a2ea75d36eebb3ae44443b8d4866",
  },
  x64: {
    "conpty.node":
      "4d2112f9316c9927145e821f20d470369c7ac8ffe63e981fb62a57c303f7f488",
    "conpty_console_list.node":
      "e57843ce4fcac607c8c0fabc89c4c475c9aa5b98166fd6e10f4751882223e500",
    "conpty/conpty.dll":
      "3319b484b80bb53d1f4d0a9eb0ea60fd0f61da69db7280ca43b84215f19245ff",
    "conpty/OpenConsole.exe":
      "7f68c840226505004215c0b82d4e502c24b5bc3f4b93c4baaaa19bd679c0def8",
  },
};
const digest = (source) => createHash("sha256").update(source).digest("hex");

const defaultHelperPath = path.resolve(
  import.meta.dirname,
  "../node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper",
);

async function prepareUnixRuntime(runtimePath) {
  let source = await readFile(runtimePath, "utf8");
  const sourceDigest = digest(source);
  if (sourceDigest === finalUnixRuntimeDigest) return;
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
  if (
    source.split("var onexit = function (code, signal)").length !== 2 ||
    source.split("_this.emit('exit', code, signal)").length !== 3
  )
    throw new Error("node-pty exec forwarding did not match reviewed source");
  source = source
    .replace(
      "var onexit = function (code, signal)",
      "var onexit = function (code, signal, execFailed)",
    )
    .replaceAll(
      "_this.emit('exit', code, signal)",
      "_this.emit('exit', code, signal, execFailed)",
    );
  if (digest(source) !== finalUnixRuntimeDigest)
    throw new Error("node-pty exec forwarding did not produce reviewed bytes");
  return source;
}

async function prepareExitEvents(file) {
  const original =
    "this.on('exit', function (exitCode, signal) { return _this._onExit.fire({ exitCode: exitCode, signal: signal }); });";
  const corrected =
    "this.on('exit', function (exitCode, signal, execFailed) { return _this._onExit.fire(execFailed === true ? { exitCode: exitCode, signal: signal, execFailed: true } : { exitCode: exitCode, signal: signal }); });";
  await prepareReviewedRuntime(
    file,
    "771f5388103c3eb7bc698b589f41c08f06044d96de609eec45c9a79e4ee4fc00",
    "61698286a777b0c76826e138a9d07424e10db77a28b91ca62a9f96f06f76ff3c",
    original,
    corrected,
  );
}

async function prepareReviewedRuntime(
  file,
  input,
  output,
  original,
  corrected,
) {
  const source = await readFile(file, "utf8");
  if (digest(source) === output) return;
  if (digest(source) !== input)
    throw new Error("Unrecognized node-pty terminal runtime");
  if (source.split(original).length !== 2)
    throw new Error(
      "node-pty terminal correction did not match reviewed source",
    );
  const prepared = source.replace(original, corrected);
  if (digest(prepared) !== output)
    throw new Error(
      "node-pty terminal correction did not produce reviewed bytes",
    );
  await writeFile(file, prepared);
}

async function verifyWindowsArtifacts(root, arch) {
  if (!Object.hasOwn(windowsNativeDigests, arch))
    throw new Error("Official Windows PTY requires ARM64 or x64");
  const expected = windowsNativeDigests[arch];
  for (const directory of ["build/Release", "build/Debug"]) {
    const entries = await readdir(path.join(root, directory)).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    if (entries.some((entry) => entry.toLowerCase().endsWith(".node")))
      throw new Error("Refusing shadowing node-pty Windows native build");
  }
  for (const [file, expectedDigest] of Object.entries(expected)) {
    if (
      digest(
        await readFile(path.join(root, "prebuilds", `win32-${arch}`, file)),
      ) !== expectedDigest
    )
      throw new Error("Unrecognized official node-pty Windows artifact");
  }
}

export async function prepareNodePtyRuntime({
  platform = process.platform,
  arch = process.arch,
  helperPath = defaultHelperPath,
  unixRuntimePath = defaultUnixRuntimePath,
  windowsRuntimePath = defaultWindowsRuntimePath,
  nodePtyRoot = defaultNodePtyRoot,
  terminalRuntimePath = path.join(nodePtyRoot, "lib/terminal.js"),
  windowsTerminalPath = path.join(nodePtyRoot, "lib/windowsTerminal.js"),
  rebuild = prepareNodePtyExecStatus,
  chmod = chmodFile,
} = {}) {
  if (
    digest(await readFile(path.join(nodePtyRoot, "lib/utils.js"))) !==
    "807bc62c8b702377d591136862309718ba48fb2b9eca54f4b25fbe43838c8fc6"
  )
    throw new Error("Unrecognized node-pty native resolution runtime");
  if (platform === "win32") {
    await verifyWindowsArtifacts(nodePtyRoot, arch);
    await preserveLiteralWindowsArguments(windowsRuntimePath);
    await prepareReviewedRuntime(
      windowsTerminalPath,
      "a805ed3bad53077b9e4572fd9ae23c4ef27b3029675e02e9b45bb3480950b3e5",
      "4ceeb76ee0c99ec013678828a3fdf309a612c4613190e5ce16840f5096f7e162",
      "            _this.emit('exit', _this._agent.exitCode);\n        });\n        // Not available",
      "            _this.emit('exit', _this._agent.exitCode, undefined, true);\n        });\n        // Not available",
    );
    await prepareExitEvents(terminalRuntimePath);
    return "corrected";
  }
  await prepareExitEvents(terminalRuntimePath);
  await prepareUnixRuntime(unixRuntimePath);
  if (platform === "linux" && ["arm64", "x64"].includes(arch)) {
    await rebuild();
    return "corrected-and-rebuilt";
  }
  if (platform === "darwin" && arch === "arm64") {
    await rebuild();
    await chmod(helperPath, 0o755);
    return "corrected-and-rebuilt";
  }
  return "corrected";
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) await prepareNodePtyRuntime();
