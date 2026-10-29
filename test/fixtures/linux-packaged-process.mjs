// Finite, headless Linux verifier controls. No Electron or desktop access.
import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
} from "node:fs";
import path from "node:path";

const role = process.argv[2];
const root = process.env.OMXTERM_FIXTURE_ROOT;
const mode = process.env.OMXTERM_FIXTURE_MODE;
const note = (text) => appendFileSync(`${root}/ordering`, `${text}\n`);
const identity = (pid) => {
  const text = readFileSync(`/proc/${pid}/stat`, "utf8");
  const fields = text
    .slice(text.lastIndexOf(")") + 2)
    .trim()
    .split(/\s+/u);
  return {
    pid,
    parent: Number(fields[1]),
    group: Number(fields[2]),
    start: fields[19],
  };
};
const controlScript =
  process.env.OMXTERM_WRAPPER_CONTROL_SCRIPT ?? process.env.BASH_ENV;
const controlStem = controlScript?.replace(/\.sh$/u, "");
// Bound even a deliberately broken implementation's test-only workloads.
setTimeout(() => process.exit(98), 10_000).unref();
appendFileSync(`${root}/launches`, `${role}\n`);

if (role === "wrapper") {
  const control = Boolean(process.env.BASH_ENV);
  if (control) {
    writeFileSync(`${root}/control-path`, controlStem);
    writeFileSync(
      `${root}/control-deadline`,
      process.env.OMXTERM_WRAPPER_CONTROL_DEADLINE,
    );
  }
  if (control && mode.startsWith("control-")) {
    if (mode === "control-recording")
      mkdirSync(path.join(path.dirname(controlScript), "zero.json"));
    const worker = spawn(
      process.execPath,
      [import.meta.filename, "control-worker"],
      { stdio: ["ignore", "inherit", "inherit", "ipc"] },
    );
    worker.on("message", (message) => {
      if (message === "ready")
        writeFileSync(
          `${root}/control-ready.json`,
          JSON.stringify({
            leader: identity(process.pid),
            worker: identity(worker.pid),
          }),
        );
      if (
        (message === "acquired" && mode === "control-streams") ||
        (message === "ready" && mode === "control-early-release")
      )
        process.exit(7);
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
  const proposal = {
    control: path.basename(controlStem),
    pid: process.pid,
    start: identity(process.pid).start,
  };
  let proposed = proposal;
  if (mode === "control-stale") proposed = { ...proposal, start: "0" };
  if (mode === "control-wrong-control")
    proposed = { ...proposal, control: "nonzero" };
  if (mode === "control-wrong-actor") {
    const parent = identity(process.ppid);
    proposed = { ...proposal, pid: parent.pid, start: parent.start };
  }
  if (mode === "control-foreign")
    proposed = {
      ...proposal,
      ...JSON.parse(process.env.OMXTERM_FIXTURE_FOREIGN),
    };
  if (mode !== "control-missing") {
    writeFileSync(
      `${controlStem}.proposal.tmp`,
      mode === "control-malformed"
        ? "{"
        : mode === "control-oversized"
          ? " ".repeat(1_025)
          : JSON.stringify(proposed),
    );
    if (mode === "control-symlink")
      symlinkSync(
        `${controlStem}.proposal.tmp`,
        `${controlStem}.proposal.json`,
      );
    else if (mode === "control-directory")
      mkdirSync(`${controlStem}.proposal.json`);
    else if (mode === "control-fifo") {
      const result = spawnSync("mkfifo", [`${controlStem}.proposal.json`]);
      if (result.status !== 0)
        throw new Error("Could not create FIFO negative control");
    } else
      renameSync(`${controlStem}.proposal.tmp`, `${controlStem}.proposal.json`);
  }
  process.send("ready");
  process.on("SIGTERM", () => undefined);
  const pending = setInterval(() => {
    if (!existsSync(`${controlStem}.acquired.json`)) return;
    const ack = JSON.parse(
      readFileSync(`${controlStem}.acquired.json`, "utf8"),
    );
    if (
      ack.control !== proposal.control ||
      ack.pid !== proposal.pid ||
      ack.start !== proposal.start
    )
      return;
    clearInterval(pending);
    process.send("acquired");
    setInterval(() => undefined, 100);
  }, 10);
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
        if (child.exitCode !== null || child.signalCode !== null) {
          if (++exited === 2) process.exit(0);
          continue;
        }
        child.once("exit", () => {
          if (++exited === 2) process.exit(0);
        });
        child.kill("SIGTERM");
      }
    }, 25);
  });
  setInterval(() => {
    if (mode === "probe-exit" && existsSync(`${root}/retire-probe`))
      probe.kill("SIGKILL");
    if (existsSync(`${root}/fail`)) {
      probe.kill("SIGKILL");
      gpu.kill("SIGKILL");
      if (mode === "signal") process.kill(process.pid, "SIGKILL");
      else process.exit(3);
    }
  }, 10);
}
