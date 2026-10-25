// Finite, headless Linux verifier controls. No Electron or desktop access.
import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const role = process.argv[2];
const root = process.env.OMXTERM_FIXTURE_ROOT;
const mode = process.env.OMXTERM_FIXTURE_MODE;
const note = (text) => appendFileSync(`${root}/ordering`, `${text}\n`);
// Bound even a deliberately broken implementation's test-only workloads.
setTimeout(() => process.exit(98), 10_000).unref();
appendFileSync(`${root}/launches`, `${role}\n`);

if (role === "wrapper") {
  const control = Boolean(process.env.BASH_ENV);
  if (control && mode.startsWith("control-")) {
    if (mode === "control-recording")
      mkdirSync(path.join(path.dirname(process.env.BASH_ENV), "zero.json"));
    const worker = spawn(
      process.execPath,
      [import.meta.filename, "control-worker"],
      { stdio: ["ignore", "inherit", "inherit", "ipc"] },
    );
    worker.on("message", () => {
      if (mode === "control-streams") process.exit(7);
    });
    process.on("SIGTERM", () => undefined);
  } else {
    const child = control
      ? spawn("bash", ["--noprofile", "--norc", "-c", ":"], {
          env: { ...process.env, APPDIR: root },
          stdio: "inherit",
        })
      : spawn(process.execPath, [import.meta.filename, "main"], {
          stdio: "inherit",
        });
    child.on("exit", (code, signal) => {
      const reap = () => {
        note("wrapper-reaped");
        process.exit(
          mode === "mask" || (mode === "mask-signal" && signal)
            ? 0
            : signal
              ? 127
              : code,
        );
      };
      if (!control && mode === "delayed-reap") {
        note("wrapper-child-exited");
        setTimeout(reap, 150);
      } else reap();
    });
  }
} else if (role === "control-worker") {
  process.stdout.write("control stdout retained\n");
  process.stderr.write("control stderr retained\n");
  process.send("ready");
  process.on("SIGTERM", () => undefined);
  setInterval(() => undefined, 100);
} else if (role === "probe" || role === "gpu") {
  process.send("ready");
  process.on("SIGTERM", () => {
    // Like Chromium: killing a child while main is still active is a failure.
    if (mode === "wrapper-hang") return;
    if (process.connected) process.send("child-term");
    note(`${role}-term`);
    process.exit(0);
  });
  setInterval(() => undefined, 100);
} else {
  let stopping = false;
  const probe = spawn(process.execPath, [import.meta.filename, "probe"], {
    detached: true,
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  const gpu = spawn(process.execPath, [import.meta.filename, "gpu"], {
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  const ready = new Set();
  for (const child of [probe, gpu])
    child.on("message", (message) => {
      if (message === "ready") {
        ready.add(child.pid);
        if (ready.size === 2)
          writeFileSync(
            `${root}/ready`,
            JSON.stringify({
              mainPid: process.pid,
              probePid: probe.pid,
              gpuPid: gpu.pid,
            }),
          );
      } else if (!stopping && mode !== "hang" && mode !== "wrapper-hang")
        process.exit(3);
    });
  process.on("SIGTERM", () => {
    note("main-term");
    if (mode === "hang" || mode === "wrapper-hang") return;
    if (mode === "streams") process.exit(0);
    setTimeout(() => {
      stopping = true;
      let exited = 0;
      for (const child of [probe, gpu]) {
        child.once("exit", () => {
          if (++exited === 2) process.exit(0);
        });
        child.kill("SIGTERM");
      }
    }, 25);
  });
  setInterval(() => {
    if (existsSync(`${root}/fail`)) {
      probe.kill("SIGKILL");
      gpu.kill("SIGKILL");
      if (mode === "signal") process.kill(process.pid, "SIGKILL");
      else process.exit(3);
    }
  }, 10);
}
