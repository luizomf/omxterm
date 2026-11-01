// Controlled byte-oriented line probe inside ConPTY, not an account shell.
let line = [];
let diagnosticReported = false;
let draftTimer;
let childInputDiagnostic;
const evidence = process.env.OMXTERM_SNIPPETS_PACKAGED_EVIDENCE;
// Inline deliberately: no module loading, filesystem calls or stdio getters
// are added before the ordinary stdin -> raw -> stdout initialization.
const memoryNonce = process.env.OMXTERM_SNIPPETS_PACKAGED_MEMORY_INPUT;
const memory = memoryNonce ? createMemoryCapture() : undefined;
function createMemoryCapture() {
  const events = [];
  let bytes = 0;
  let inputBytes = 0;
  let overflow = false;
  let frozen = false;
  const started = process.hrtime.bigint();
  function record(kind, fields = {}) {
    if (frozen || overflow) return;
    const event = {
      sequence: events.length + 1,
      ns: (process.hrtime.bigint() - started).toString(),
      kind,
      ...fields,
    };
    const size = Buffer.byteLength(JSON.stringify(event));
    if (events.length >= 256 || bytes + size > 262144) {
      overflow = true;
      return;
    }
    bytes += size;
    events.push(event);
  }
  record("start");
  return {
    record,
    input(chunk, before) {
      if (frozen || overflow) return;
      if (!Buffer.isBuffer(chunk) || inputBytes + chunk.length > 65536) {
        overflow = true;
        return;
      }
      inputBytes += chunk.length;
      record("stdin", {
        data: chunk.toString("base64"),
        lineBefore: Buffer.from(before).toString("base64"),
      });
    },
    arm() {
      record("listener-attached");
      setTimeout(() => {
        // One synchronous dump turn: no stdin/timer callback can interleave.
        // Exclusive outcome-file creation arbitrates an early dump against the
        // parent's completed observation, without polling during observation.
        const fs = require("node:fs");
        const path = require("node:path");
        let outcomeText = null;
        let error = null;
        try {
          const p = path.join(evidence, "memory-observation.json");
          try {
            fs.writeFileSync(p, JSON.stringify({ earlyDump: true }), {
              flag: "wx",
            });
            throw Error("Dump started before parent observation completed");
          } catch (cause) {
            if (cause.code !== "EEXIST") throw cause;
          }
          if (fs.statSync(p).size > 8192) throw Error("Outcome exceeds bound");
          outcomeText = fs.readFileSync(p, "utf8");
        } catch (cause) {
          error = String(cause);
        }
        record("dump-boundary");
        frozen = true;
        const dump = {
          classification: "first-insert-memory-not-qualification",
          nonce: memoryNonce,
          pid: process.pid,
          delayMs: 60000,
          overflow,
          events,
          outcomeText,
          error,
        };
        try {
          const temporary = path.join(evidence, "memory-child.json.tmp");
          const destination = path.join(evidence, "memory-child.json");
          fs.writeFileSync(temporary, JSON.stringify(dump), { flag: "wx" });
          if (fs.existsSync(destination)) throw Error("Dump already exists");
          fs.renameSync(temporary, destination);
        } catch {
          // Missing/partial evidence is inconclusive. Never write to stdio,
          // retry, change the parser, or force the owned child to exit.
        }
      }, 60000);
    },
  };
}
if (
  (process.env.OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC === "1" ||
    process.env.OMXTERM_SNIPPETS_PACKAGED_CHILD_INPUT_CAPTURE === "1") &&
  evidence &&
  require("node:path").isAbsolute(evidence)
) {
  try {
    childInputDiagnostic =
      require("./snippets-child-input-diagnostic.cjs").startChildInputDiagnostic(
        evidence,
      );
  } catch (error) {
    try {
      require("node:fs").writeFileSync(
        require("node:path").join(evidence, "child-input-capture-error.json"),
        JSON.stringify({ stage: "setup", error: String(error) }),
        { flag: "wx" },
      );
    } catch {
      // Missing diagnostic evidence is unknown, not an input result.
    }
  }
}
childInputDiagnostic?.record("start", {
  phase: "startup",
  limits: childInputDiagnostic?.limits,
  pid: process.pid,
  parent: process.ppid,
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  childInputCapture:
    process.env.OMXTERM_SNIPPETS_PACKAGED_CHILD_INPUT_CAPTURE === "1",
  insertDiagnostic:
    process.env.OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC === "1",
  readinessDiagnostic:
    process.env.OMXTERM_SNIPPETS_PACKAGED_READINESS_DIAGNOSTIC === "1",
  stdinIsTTY: process.stdin.isTTY ?? null,
  stdoutIsTTY: process.stdout.isTTY ?? null,
  stdinIsRaw: process.stdin.isRaw ?? null,
});
if (childInputDiagnostic) {
  process.once("uncaughtExceptionMonitor", (error, origin) =>
    childInputDiagnostic.record("uncaught-error", {
      phase: "error",
      origin,
      error: String(error),
    }),
  );
  process.once("exit", (code) => childInputDiagnostic.close(code));
}
const insert = Buffer.from("  SNIPPETS_INSERT  ", "utf8").toString("hex");
const run = Buffer.from("SNIPPETS_RUN", "utf8").toString("hex");
const responses = new Map([
  [insert, "SNIPPETS_INSERT_RECEIPT"],
  [run, "SNIPPETS_RUN_RECEIPT"],
  [
    Buffer.from("SNIPPETS_PING", "utf8").toString("hex"),
    "SNIPPETS_AFTER_RETIREMENT",
  ],
]);
const rawRequested = Boolean(process.stdin.isTTY);
if (rawRequested) process.stdin.setRawMode(true);
memory?.record("raw-request-returned", { requested: rawRequested });
childInputDiagnostic?.record("raw-mode", {
  phase: "startup",
  requested: process.stdin.isTTY === true,
  stdinIsRaw: process.stdin.isRaw ?? null,
});
// Disable child-facing focus and bracketed paste; ConPTY may enable outer focus.
process.stdout.write("\u001b[?1004l\u001b[?2004lSNIPPETS_SHELL_READY\n");
memory?.record("ready-write-returned");
childInputDiagnostic?.record("ready-write", { phase: "startup" });
process.stdin.on("data", (chunk) => {
  memory?.input(chunk, line);
  childInputDiagnostic?.input(chunk, line.length);
  memory?.record("timer-cancel", { pending: draftTimer !== undefined });
  clearTimeout(draftTimer);
  draftTimer = undefined;
  for (const byte of chunk) {
    if (byte === 3) {
      line = [];
      process.stdout.write("SNIPPETS_DRAFT_CLEARED\n");
    } else if (byte === 13 || byte === 10) {
      const response = responses.get(Buffer.from(line).toString("hex"));
      if (response) process.stdout.write(response + "\n");
      else if (line.length) {
        childInputDiagnostic?.record("probe-error", {
          phase: "stdin-callback",
          error: "Unexpected controlled probe input",
          lineLength: line.length,
        });
        memory?.record("probe-error", {
          lineAfter: Buffer.from(line).toString("base64"),
          reason: "unexpected-line",
        });
        process.stdin.pause();
        process.stderr.write("Unexpected controlled probe input\n", () =>
          process.exit(1),
        );
        return;
      }
      line = [];
    } else {
      line.push(byte);
      if (line.length > 4096) {
        childInputDiagnostic?.record("probe-error", {
          phase: "stdin-callback",
          error: "Controlled probe input exceeded bound",
          lineLength: line.length,
        });
        memory?.record("probe-error", {
          lineAfter: Buffer.from(line).toString("base64"),
          reason: "line-bound",
        });
        process.stdin.pause();
        process.stderr.write("Controlled probe input exceeded bound\n", () =>
          process.exit(1),
        );
        return;
      }
    }
  }
  memory?.record("processed", {
    lineAfter: Buffer.from(line).toString("base64"),
  });
  const value = Buffer.from(line).toString("hex");
  childInputDiagnostic?.record("input-processed", {
    phase: "stdin-callback",
    lineLength: line.length,
    draft: value === insert ? "insert" : value === run ? "run" : null,
  });
  if (value === insert || value === run) {
    childInputDiagnostic?.record("draft-scheduled", {
      phase: "stdin-callback",
      draft: value === insert ? "insert" : "run",
      delayMs: 150,
    });
    memory?.record("timer-schedule", { draft: value, delayMs: 150 });
    draftTimer = setTimeout(() => {
      draftTimer = undefined;
      const matches = Buffer.from(line).toString("hex") === value;
      childInputDiagnostic?.record("draft-timer", {
        phase: "draft-timer",
        draft: value === insert ? "insert" : "run",
        matches,
        lineLength: line.length,
      });
      memory?.record("timer-fire", {
        matches,
        line: Buffer.from(line).toString("base64"),
      });
      if (!matches) return;
      memory?.record("receipt-write-invoked", { draft: value });
      process.stdout.write(
        value === insert
          ? "SNIPPETS_INSERT_DRAFT_RECEIPT\n"
          : "SNIPPETS_RUN_DRAFT_RECEIPT\n",
      );
      memory?.record("receipt-write-returned", { draft: value });
      childInputDiagnostic?.record("draft-receipt-write", {
        phase: "draft-timer",
        draft: value === insert ? "insert" : "run",
      });
      if (
        value === insert &&
        !diagnosticReported &&
        process.env.OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC === "1"
      ) {
        diagnosticReported = true;
        process.stdout.write("SNIPPETS_DIAGNOSTIC_INSERT_RECEIVED\n");
      }
    }, 150);
  }
});
childInputDiagnostic?.record("listener-attached", { phase: "startup" });
memory?.arm();
