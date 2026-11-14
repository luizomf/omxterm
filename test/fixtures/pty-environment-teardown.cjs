// A PTY child ends while its Node environment is being freed, the way a shell
// can die under a forced app.exit() (#1042). A worker's environment is freed
// on exit like Electron's main one, and the timing here is deterministic: the
// exit handler holds the environment open until node-pty has reaped the
// child, so its exit report is still queued once JS can no longer run.
const { Worker, isMainThread } = require("node:worker_threads");

if (isMainThread) {
  new Worker(__filename).on("exit", (code) => {
    process.stdout.write(`PTY_TEARDOWN_WORKER_EXIT ${code}\n`);
  });
} else {
  const pty = require("node-pty").spawn("/bin/sh", ["-c", "sleep 30"], {
    cols: 80,
    rows: 24,
  });
  pty.onExit(() => {});
  process.on("exit", () => {
    process.kill(pty.pid, "SIGKILL");
    const pause = new Int32Array(new SharedArrayBuffer(4));
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      try {
        process.kill(pty.pid, 0);
      } catch {
        break;
      }
      Atomics.wait(pause, 0, 0, 1);
    }
    Atomics.wait(pause, 0, 0, 20);
  });
  setTimeout(() => process.exit(0), 100);
}
