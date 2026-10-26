// Run only with the exact packaged Electron in ELECTRON_RUN_AS_NODE mode.
const assert = require("node:assert/strict");
const path = require("node:path");
const asar = process.argv[2];
assert(path.isAbsolute(asar), "Expected an absolute packaged ASAR path");
assert(process.versions.electron, "Expected the packaged Electron runtime");
const ptyRoot = path.join(asar, "node_modules/node-pty");
const pty = require(ptyRoot);
const nativeRoot = path.join(
  `${asar}.unpacked`,
  "node_modules/node-pty",
  ...(process.platform === "win32"
    ? ["prebuilds", `win32-${process.arch}`]
    : process.platform === "darwin"
      ? ["prebuilds", "darwin-arm64"]
      : ["build", "Release"]),
);
const native = require(
  path.join(
    nativeRoot,
    process.platform === "win32" ? "conpty.node" : "pty.node",
  ),
);
if (process.platform === "win32")
  require(path.join(nativeRoot, "conpty_console_list.node"));

async function unixCase(
  executable,
  args,
  expectedCode,
  execFailed,
  outputToken,
) {
  const child = pty.spawn(executable, args, {
    cols: 80,
    rows: 24,
    cwd: "/",
    env: { PATH: "/usr/bin:/bin" },
  });
  let output = "";
  let exited = false;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Packaged PTY deadline exceeded"));
      }, 5000);
      child.onData((data) => {
        output += data;
        if (output.length > 4096) {
          child.kill();
          clearTimeout(timer);
          reject(new Error("PTY output limit exceeded"));
        }
      });
      child.onExit((event) => {
        exited = true;
        clearTimeout(timer);
        try {
          assert.equal(event.exitCode, expectedCode);
          assert.equal(event.execFailed === true, execFailed);
          if (outputToken) assert(output.includes(outputToken));
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      if (outputToken) child.resize(100, 30);
    });
  } finally {
    if (!exited) child.kill();
  }
}
(async () => {
  const checks = ["packaged-addon-load"];
  if (process.platform === "linux") {
    assert.throws(
      () => native.resize(-1, 80, 24, 0, 0),
      /ioctl\(2\) failed, EBADF/u,
    );
    checks.push("invalid-fd-resize-error");
    await unixCase(
      "/bin/sh",
      ["-c", "printf OMXTERM_PTY_OK; sleep 0.1; exit 0"],
      0,
      false,
      "OMXTERM_PTY_OK",
    );
    await unixCase("/omxterm-intentionally-missing-executable", [], 1, true);
    await unixCase("/bin/sh", ["-c", "exit 1"], 1, false);
    checks.push(
      "real-pty-output-exit-resize",
      "exec-failure-distinct-from-exit-1",
    );
  }
  console.log(
    JSON.stringify({
      versions: process.versions,
      platform: process.platform,
      arch: process.arch,
      checks,
    }),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
