import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const signalHelper = fileURLToPath(
  new URL("./linux-packaged-signal.py", import.meta.url),
);
const delay = () => new Promise((resolve) => setTimeout(resolve, 50));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function processes() {
  return readdirSync("/proc")
    .filter((name) => /^\d+$/u.test(name))
    .flatMap((name) => {
      try {
        const text = readFileSync(`/proc/${name}/stat`, "utf8");
        const fields = text
          .slice(text.lastIndexOf(")") + 2)
          .trim()
          .split(/\s+/u);
        return [
          {
            pid: Number(name),
            parent: Number(fields[1]),
            group: Number(fields[2]),
            start: fields[19],
          },
        ];
      } catch (cause) {
        // Other users' proc entries may be hidden; they are not ownership roots.
        if (["ENOENT", "ESRCH", "EACCES", "EPERM"].includes(cause.code))
          return [];
        throw cause;
      }
    });
}

function invokeSignalHelper(request, label) {
  const result = spawnSync("python3", ["-I", signalHelper], {
    input: JSON.stringify(request),
    encoding: "utf8",
    timeout: 2_000,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Linux ${label} failed: ${result.error?.message ?? result.stderr.trim()}`,
    );
  return result.stdout.trim();
}

function checkLinuxSignaling() {
  if (
    invokeSignalHelper({ check: true }, "pidfd capability preflight") !==
    "linux-pidfd-ready"
  )
    throw new Error(
      "Linux pidfd capability preflight did not return its proof",
    );
}

function signalOwned(targets, signal, recovery = false) {
  if (targets.length)
    invokeSignalHelper(
      { targets, signal, recovery },
      `identity-checked ${signal}`,
    );
}

// Exercise the exact AppImage runtime's wait-status handling without a GUI.
// AppRun is a reviewed bash script. BASH_ENV replaces it with a controlled
// native Run-as-Node child, bypassing only AppRun's Node-invalid --no-sandbox.
// A zero wrapper result after either failure control is never acceptable proof.
export async function verifyLinuxWrapperPropagation(
  executable,
  timeoutMs = 20_000,
) {
  checkLinuxSignaling();
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-wrapper-outcome-"));
  const artifactDigest = digest(await readFile(executable));
  let complete = false;
  try {
    for (const [name, action, expected] of [
      ["zero", "process.exit(0)", 0],
      ["nonzero", "process.exit(3)", 3],
      ["signal", "process.kill(process.pid, 'SIGTERM')", null],
    ]) {
      const script = path.join(root, `${name}.sh`);
      const marker = `OMXTERM_WRAPPER_CONTROL_${name}`;
      await writeFile(
        script,
        `exec "$APPDIR/omxterm" -e ${JSON.stringify(`process.stdout.write('${marker}'); ${action}`)}\n`,
      );
      const child = spawn(executable, ["--appimage-extract-and-run"], {
        detached: true,
        env: {
          ...process.env,
          BASH_ENV: script,
          ELECTRON_RUN_AS_NODE: "1",
          DISPLAY: "",
          WAYLAND_DISPLAY: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let error;
      let outcome;
      let closed = false;
      const owned = new Map();
      const collect = () => {
        const rows = processes();
        const leader = rows.find((row) => row.pid === child.pid);
        if (!owned.size && leader) owned.set(leader.pid, leader);
        collectDescendants(rows, owned, child.pid);
        return rows.filter((row) => owned.get(row.pid)?.start === row.start);
      };
      child.on("error", (cause) => {
        error = cause;
      });
      child.on("exit", (code, signal) => {
        outcome = { code, signal };
      });
      child.on("close", () => {
        closed = true;
      });
      child.stdout.on("data", (chunk) => {
        stdout = (stdout + chunk).slice(-16_384);
      });
      child.stderr.on("data", (chunk) => {
        stderr = (stderr + chunk).slice(-16_384);
      });
      const failures = [];
      let beforeCleanup;
      let remaining;
      try {
        const deadline = Date.now() + timeoutMs;
        while (!closed && !error && Date.now() < deadline) {
          collect();
          await delay();
        }
        remaining = collect();
        beforeCleanup = { outcome, closed, remaining };
        if (!closed || remaining.length)
          failures.push(
            new Error("Linux wrapper outcome control did not settle"),
          );
        if (error) failures.push(error);
        if (
          closed &&
          (stdout !== marker ||
            outcome?.signal !== null ||
            (expected === null
              ? outcome?.code === 0
              : outcome?.code !== expected))
        )
          failures.push(
            new Error(
              `Linux wrapper masks or fails ${name} outcome control (exit ${outcome?.code}, signal ${outcome?.signal}): ${stderr}`,
            ),
          );
      } catch (observation) {
        failures.push(observation);
      }
      if (failures.length) {
        try {
          signalOwned(collect(), "SIGKILL", true);
        } catch (cleanup) {
          failures.push(cleanup);
        }
        try {
          const cleanupDeadline = Date.now() + 2_000;
          while ((!closed || collect().length) && Date.now() < cleanupDeadline)
            await delay();
          if (!closed || collect().length)
            failures.push(
              new Error("Linux wrapper control failure cleanup did not settle"),
            );
        } catch (cleanup) {
          failures.push(cleanup);
        }
      }
      try {
        remaining = collect();
      } catch (observation) {
        failures.push(observation);
      }
      // Persist after recovery even when signaling failed; never let a cleanup
      // or recording exception replace the primary timeout/native observation.
      try {
        await writeFile(
          path.join(root, `${name}.json`),
          `${JSON.stringify({ beforeCleanup, outcome, closed, stdout, stderr, remaining, launchError: error?.message, failures: failures.map((failure) => failure.message) })}\n`,
        );
      } catch (recording) {
        failures.push(recording);
      }
      if (failures.length) {
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
        throw new AggregateError(
          failures,
          failures.map((failure) => failure.message).join("; "),
        );
      }
    }
    if (digest(await readFile(executable)) !== artifactDigest)
      throw new Error("Linux wrapper changed during outcome controls");
    complete = true;
    return artifactDigest;
  } catch (cause) {
    throw new AggregateError(
      cause instanceof AggregateError ? cause.errors : [cause],
      `${cause.message}; wrapper controls retained at ${root}`,
      { cause },
    );
  } finally {
    if (complete) await rm(root, { recursive: true, force: true });
  }
}

function collectDescendants(rows, owned, group) {
  // Keep Chromium children even after reparenting, while a retained identity
  // still anchors this exact launch group. PTY sessions are collected by descent.
  if (
    rows.some(
      (row) => row.group === group && owned.get(row.pid)?.start === row.start,
    )
  ) {
    for (const row of rows) if (row.group === group) owned.set(row.pid, row);
  }
  let changed;
  do {
    changed = false;
    for (const row of rows) {
      const parent = owned.get(row.parent);
      if (
        !parent ||
        !rows.some(
          (candidate) =>
            candidate.pid === parent.pid && candidate.start === parent.start,
        ) ||
        BigInt(row.start) < BigInt(parent.start) ||
        owned.get(row.pid)?.start === row.start
      )
        continue;
      owned.set(row.pid, row);
      changed = true;
    }
  } while (changed);
}

// Linux packaged-startup ownership only. Helper provisioning and other OSes
// deliberately retain their existing shutdown policies.
export async function launchLinuxPackagedProcess({
  executable,
  args,
  env,
  expectedExecutable,
  readinessFile,
  profileRoot,
  wrapper = false,
  timeoutMs = 2_000,
}) {
  checkLinuxSignaling();
  const expectedDigest = digest(await readFile(expectedExecutable));
  const wrapperDigest = wrapper
    ? await verifyLinuxWrapperPropagation(executable)
    : undefined;
  if (wrapper && digest(await readFile(executable)) !== wrapperDigest)
    throw new Error("Linux wrapper changed after outcome controls");
  const child = spawn(executable, args, {
    detached: true,
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  let launchError;
  let outcome;
  let closed = false;
  let trackingError;
  let main;
  const owned = new Map();
  child.on("error", (cause) => {
    launchError = cause;
  });
  child.on("exit", (code, signal) => {
    outcome = { code, signal };
  });
  child.on("close", () => {
    closed = true;
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(0, 16_384);
  });
  let initial;
  try {
    initial = processes().find((row) => row.pid === child.pid);
    if (initial) owned.set(initial.pid, initial);
  } catch (cause) {
    trackingError = cause;
  }
  const collect = () => {
    const rows = processes();
    collectDescendants(rows, owned, child.pid);
    return rows.filter((row) => owned.get(row.pid)?.start === row.start);
  };
  const timer = setInterval(() => {
    try {
      collect();
    } catch (cause) {
      trackingError ??= cause;
    }
  }, 50);

  async function verifyMain() {
    if (launchError) throw launchError;
    if (trackingError) throw trackingError;
    const receipt = JSON.parse(await readFile(readinessFile, "utf8"));
    const rows = collect();
    const leader = rows.find(
      (row) => row.pid === child.pid && row.start === initial?.start,
    );
    const candidate = rows.find((row) => row.pid === receipt.mainPid);
    const probe = rows.find((row) => row.pid === receipt.probePid);
    if (
      !leader ||
      !candidate ||
      !probe ||
      probe.parent !== candidate.pid ||
      candidate.group !== leader.pid ||
      (wrapper
        ? candidate.parent !== leader.pid
        : candidate.pid !== leader.pid) ||
      !Number.isSafeInteger(receipt.mainPid) ||
      !Number.isSafeInteger(receipt.probePid)
    )
      throw new Error(
        "Linux readiness does not identify a main within the owned launch lineage",
      );
    if (digest(await readFile(`/proc/${candidate.pid}/exe`)) !== expectedDigest)
      throw new Error(
        "Linux main executable differs from the inspected package",
      );
    if (main && (main.pid !== candidate.pid || main.start !== candidate.start))
      throw new Error("Linux main identity changed after readiness");
    main = { ...candidate, digest: expectedDigest };
  }

  async function settled() {
    const deadline = Date.now() + timeoutMs;
    do {
      if (outcome && closed && collect().length === 0) return true;
      await delay();
    } while (Date.now() < deadline);
    return false;
  }

  return {
    child,
    stderrText: () => stderr,
    verifyMain,
    async stop() {
      const failures = [];
      try {
        if (outcome && (outcome.code !== 0 || outcome.signal !== null))
          throw new Error(
            `Linux packaged native failure (exit ${outcome.code}, signal ${outcome.signal})`,
          );
        if (!main) await verifyMain();
        const rows = collect();
        const current = rows.find((row) => row.pid === main.pid);
        if (current) {
          if (current.start !== main.start)
            throw new Error("Linux main identity changed after readiness");
          if (
            !rows.some(
              (row) => row.pid === initial?.pid && row.start === initial.start,
            ) ||
            current.parent !== main.parent ||
            current.group !== main.group
          )
            throw new Error("Linux main left the owned launch lineage");
          signalOwned([main], "SIGTERM");
        }
        // Main can already have exited after readiness. Preserve its wrapper
        // and streams long enough to reap and propagate that native outcome.
        if (!(await settled()))
          throw new Error(
            "Linux packaged exit/stream closure/owned settlement deadline exceeded",
          );
        if (outcome.code !== 0 || outcome.signal !== null)
          throw new Error(
            `Linux packaged native failure (exit ${outcome.code}, signal ${outcome.signal})`,
          );
        if (trackingError) throw trackingError;
      } catch (cause) {
        failures.push(cause);
        // Escalation is failure recovery ONLY. Never overwrite the native result
        // or convert a crash/timeout into success because its group disappeared.
        for (const signal of ["SIGTERM", "SIGKILL"]) {
          try {
            signalOwned(collect(), signal, true);
            if (await settled()) break;
          } catch (cleanup) {
            failures.push(cleanup);
          }
        }
        try {
          if (!(outcome && closed && collect().length === 0))
            failures.push(
              new Error("Linux packaged failure cleanup did not settle"),
            );
        } catch (cleanup) {
          failures.push(cleanup);
        }
        if (
          outcome &&
          (outcome.code !== 0 || outcome.signal !== null) &&
          !failures.some((failure) =>
            failure.message.includes("native failure"),
          )
        )
          failures.push(
            new Error(
              `Linux packaged native failure (exit ${outcome.code}, signal ${outcome.signal})`,
            ),
          );
      } finally {
        clearInterval(timer);
      }
      if (failures.length) {
        const message = failures.map((failure) => failure.message).join("; ");
        try {
          await writeFile(
            path.join(profileRoot, "linux-process-result.json"),
            `${JSON.stringify({ main, outcomeRole: wrapper ? "AppImage wrapper (failure propagation checked)" : "Electron main", outcome, launchError: launchError?.message, closed, stderr, remaining: collect(), failures: failures.map((failure) => failure.message) }, null, 2)}\n`,
          );
        } catch (recording) {
          failures.push(recording);
        }
        child.stderr.destroy();
        child.unref();
        throw new AggregateError(
          failures,
          `${message}; recovery retained at ${profileRoot}`,
        );
      }
      return outcome;
    },
  };
}
