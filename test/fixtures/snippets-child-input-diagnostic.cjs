// Private synthetic fixture evidence only. It never reads or changes PTY input.
const fs = require("node:fs");
const path = require("node:path");

const maxEvents = 256;
const maxInputBytes = 65536;
const maxSerializedBytes = 262144;
const reserveBytes = 2048;

function startChildInputDiagnostic(directory) {
  const journalPath = path.join(directory, "child-input-diagnostic.jsonl");
  const errorPath = path.join(directory, "child-input-capture-error.json");
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
          classification: "synthetic-child-input-diagnostic-not-qualification",
          stage,
          error: String(error),
          completeEvents: sequence,
          capturedInputBytes: inputBytes,
        }),
        { flag: "wx" },
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
        checkpointVisible: fs.existsSync(checkpointPath),
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
          capturedInputBytes: inputBytes,
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
      inputBytes: maxInputBytes,
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
    close(code) {
      if (stopped) return;
      record("process-exit", { phase: "exit", code });
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
module.exports = { startChildInputDiagnostic };
