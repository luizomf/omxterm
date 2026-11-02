// Private synthetic fixture evidence only. It never reads or changes PTY input.
const fs = require("node:fs");
const path = require("node:path");

const maxEvents = 256;
const maxInputBytes = 65536;
const maxSerializedBytes = 262144;
const reserveBytes = 2048;

function startJournal(directory, parent) {
  const journalPath = path.join(
    directory,
    parent ? "parent-pty-diagnostic.jsonl" : "child-input-diagnostic.jsonl",
  );
  const errorPath = path.join(
    directory,
    parent ? "parent-pty-capture-error.json" : "child-input-capture-error.json",
  );
  const classification = parent
    ? "synthetic-parent-pty-attempts-not-qualification"
    : "synthetic-child-input-diagnostic-not-qualification";
  const checkpointPath = path.join(directory, "child-input-checkpoint.json");
  let fd;
  let sequence = 0;
  let serializedBytes = 0;
  let inputBytes = 0;
  let stopped = false;
  function reportError(stage, error) {
    stopped = true;
    try {
      fs.writeFileSync(
        errorPath,
        JSON.stringify({
          classification,
          stage,
          error: String(error),
          completeEvents: sequence,
          ...(parent
            ? { capturedPtyDataBytes: inputBytes }
            : { capturedInputBytes: inputBytes }),
        }),
        { flag: "wx", ...(parent ? { mode: 0o600 } : {}) },
      );
    } catch {
      // An absent/partial journal or sidecar remains unknown, never success.
    }
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // Keep the original capture error.
      }
      fd = undefined;
    }
  }
  function write(bytes) {
    let offset = 0;
    while (offset < bytes.length) {
      const written = fs.writeSync(fd, bytes, offset, bytes.length - offset);
      if (written <= 0) throw Error("Child input capture made no progress");
      offset += written;
    }
    serializedBytes += bytes.length;
    sequence++;
  }
  function makeEvent(kind, fields) {
    return Buffer.from(
      JSON.stringify({
        sequence: sequence + 1,
        monotonicNs: process.hrtime.bigint().toString(),
        utc: new Date().toISOString(),
        ...(!parent
          ? { checkpointVisible: fs.existsSync(checkpointPath) }
          : {}),
        kind,
        ...fields,
      }) + "\n",
    );
  }
  function truncate(reason, fields = {}) {
    if (stopped) return;
    try {
      write(
        makeEvent("capture-truncated", {
          reason,
          ...(parent
            ? { capturedPtyDataBytes: inputBytes }
            : { capturedInputBytes: inputBytes }),
          ...fields,
        }),
      );
      stopped = true;
      fs.closeSync(fd);
      fd = undefined;
    } catch (error) {
      reportError("truncate", error);
    }
  }
  function record(kind, fields = {}) {
    if (stopped) return false;
    try {
      const bytes = makeEvent(kind, fields);
      if (
        sequence >= maxEvents - 1 ||
        serializedBytes + bytes.length > maxSerializedBytes - reserveBytes
      ) {
        truncate("event-or-serialized-bound");
        return false;
      }
      write(bytes);
      return true;
    } catch (error) {
      reportError("write", error);
      return false;
    }
  }
  try {
    fd = fs.openSync(journalPath, "wx", 0o600);
  } catch (error) {
    reportError("open", error);
  }
  return {
    limits: {
      events: maxEvents,
      ...(parent
        ? { ptyDataBytes: maxInputBytes }
        : { inputBytes: maxInputBytes }),
      serializedBytes: maxSerializedBytes,
    },
    record,
    input(chunk, lineLengthBefore) {
      if (stopped) return;
      if (!Buffer.isBuffer(chunk)) {
        record("non-buffer-stdin", { phase: "stdin-callback" });
        return;
      }
      if (inputBytes + chunk.length > maxInputBytes) {
        truncate("input-byte-bound", { observedChunkBytes: chunk.length });
        return;
      }
      if (
        record("stdin", {
          phase: "stdin-callback",
          bytes: chunk.length,
          data: chunk.toString("base64"),
          lineLengthBefore,
        })
      )
        inputBytes += chunk.length;
    },
    trace(event) {
      if (stopped) return;
      try {
        const { kind, ptyIndex, pid, data, dataType } = event;
        const fields = {
          ptyIndex,
          pid,
          pidKnown: Number.isSafeInteger(pid) && pid > 0,
          boundary:
            kind === "pty-write"
              ? "pre-call-write"
              : kind === "pty-output"
                ? "observed-output"
                : "attachment",
        };
        if (ptyIndex !== 0) {
          record("unexpected-pty", { ...fields, incomplete: true });
          truncate("unexpected-pty-index");
          return;
        }
        if (kind === "pty-attached") {
          record(kind, fields);
          return;
        }
        if (typeof data !== "string") {
          record(kind, { ...fields, data: null, dataType, incomplete: true });
          truncate("non-string-pty-data");
          return;
        }
        const bytes = data.length * 2;
        if (inputBytes + bytes > maxInputBytes) {
          truncate("pty-data-byte-bound", { observedChunkBytes: bytes });
          return;
        }
        if (
          record(kind, {
            ...fields,
            encoding: "utf16le-base64",
            bytes,
            data: Buffer.from(data, "utf16le").toString("base64"),
          })
        )
          inputBytes += bytes;
      } catch (error) {
        reportError("trace", error);
      }
    },
    close(code) {
      if (stopped) return;
      if (parent) record("capture-closed");
      else record("process-exit", { phase: "exit", code });
      if (stopped) return;
      try {
        fs.closeSync(fd);
        fd = undefined;
        stopped = true;
      } catch (error) {
        reportError("close", error);
      }
    },
  };
}
function startChildInputDiagnostic(directory) {
  return startJournal(directory, false);
}

function startParentPtyDiagnostic(directory) {
  const journal = startJournal(directory, true);
  journal.record("start", {
    classification: "synthetic-parent-pty-attempts-not-qualification",
    observation: "pty-write-before-original-call-not-child-stdin",
    limits: journal.limits,
  });
  return journal;
}
module.exports = { startChildInputDiagnostic, startParentPtyDiagnostic };
