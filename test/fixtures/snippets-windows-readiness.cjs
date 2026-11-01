// Windows source fixture only: observe the original output and renderer ACKs.
// This never writes to a terminal or changes the forwarded output.
const assert = require("node:assert/strict");
const readyMarker = "\u001b[?2004lSNIPPETS_SHELL_READY\r\n";
const focusReset = "\u001b[?1004l";
const focusEnable = "\u001b[?1004h";
const maxOutput = 65536;

function outerFocusEnableAfterReset(output, markerAt) {
  const resetAt = output.lastIndexOf(focusReset, markerAt);
  const enabledAt = output.indexOf(focusEnable, resetAt + focusReset.length);
  return resetAt >= 0 && enabledAt > resetAt && enabledAt < markerAt;
}

function startWindowsProbeReadiness({
  app,
  ipcMain,
  ptys,
  createInputHandler,
  diagnostic = false,
}) {
  const cores = new Map();
  const events = [];
  let eventCount = 0;
  let eventBytes = 0;
  let eventsTruncated = false;
  let observationUnavailable = false;
  const id = (value) => {
    try {
      return Number.isSafeInteger(value?.id) ? value.id : null;
    } catch {
      return null;
    }
  };
  function record(event) {
    if (!diagnostic) return;
    eventCount++;
    try {
      const item = { ...event, sequence: eventCount };
      const bytes = Buffer.byteLength(JSON.stringify(item), "utf8");
      if (events.length >= 128 || eventBytes + bytes > 65536) {
        eventsTruncated = true;
        return;
      }
      eventBytes += bytes;
      events.push(item);
    } catch {
      observationUnavailable = true;
    }
  }
  const created = (_event, window) => {
    const core = window.webContents;
    const original = core.send;
    const own = Object.getOwnPropertyDescriptor(core, "send");
    const state = {
      output: "",
      sentEnd: 0,
      ackEnd: 0,
      markerEnd: 0,
      parser: createInputHandler({ sendReply() {} }),
      invalid: false,
      invalidReason: null,
    };
    function send(...args) {
      const [channel, payload] = args;
      let result;
      try {
        result = Reflect.apply(original, this, args);
      } catch (error) {
        if (diagnostic && channel === "terminal:output") {
          try {
            record({
              kind: "main-output-send-threw",
              coreId: id(core),
              sessionId:
                typeof payload?.sessionId === "string"
                  ? payload.sessionId
                  : null,
              end: Number.isSafeInteger(payload?.end) ? payload.end : null,
              data: typeof payload?.data === "string" ? payload.data : null,
              error: String(error).slice(0, 256),
            });
          } catch {
            observationUnavailable = true;
          }
        }
        throw error;
      }
      if (diagnostic && channel === "terminal:output") {
        try {
          record({
            kind: "main-output",
            coreId: id(core),
            receiverMatches: this === core,
            sessionId:
              typeof payload?.sessionId === "string" ? payload.sessionId : null,
            end: Number.isSafeInteger(payload?.end) ? payload.end : null,
            endType: typeof payload?.end,
            expectedEnd:
              typeof payload?.data === "string"
                ? state.sentEnd + Buffer.byteLength(payload.data, "utf8")
                : null,
            data: typeof payload?.data === "string" ? payload.data : null,
          });
        } catch {
          observationUnavailable = true;
        }
      }
      if (this !== core || channel !== "terminal:output") return result;
      if (
        !payload ||
        payload.sessionId !== "s1" ||
        typeof payload.data !== "string" ||
        !Number.isSafeInteger(payload.end) ||
        payload.end !== state.sentEnd + Buffer.byteLength(payload.data, "utf8")
      ) {
        state.invalid = true;
        state.invalidReason ??= "invalid-output-or-progress";
        return result;
      }
      state.sentEnd = payload.end;
      state.output += payload.data;
      if (state.output.length > maxOutput) {
        state.invalid = true;
        state.invalidReason ??= "output-bound";
        state.output = "";
        return result;
      }
      try {
        state.parser.filterOutput(payload.data);
      } catch {
        state.invalid = true;
        state.invalidReason ??= "parser-error";
      }
      if (!state.markerEnd && state.output.includes(readyMarker))
        state.markerEnd = payload.end;
      return result;
    }
    core.send = send;
    assert.equal(core.send, send, "probe output observation installed");
    cores.set(core, { state, own, send });
    record({ kind: "core-attached", coreId: id(core) });
  };
  const ack = (event, payload) => {
    const core = event.sender;
    const found = cores.get(core);
    if (diagnostic) {
      try {
        record({
          kind: "renderer-ack",
          coreId: id(core),
          coreObserved: !!found,
          senderFrameMatches: found
            ? event.senderFrame === core.mainFrame
            : null,
          sessionId:
            typeof payload?.sessionId === "string" ? payload.sessionId : null,
          end: Number.isSafeInteger(payload?.end) ? payload.end : null,
          endType: typeof payload?.end,
        });
      } catch {
        observationUnavailable = true;
      }
    }
    if (
      !found ||
      event.senderFrame !== core.mainFrame ||
      !payload ||
      payload.sessionId !== "s1" ||
      !Number.isSafeInteger(payload.end) ||
      payload.end <= 0 ||
      payload.end > found.state.sentEnd
    )
      return;
    found.state.ackEnd = Math.max(found.state.ackEnd, payload.end);
  };
  app.on("browser-window-created", created);
  ipcMain.on("terminal:output-ack", ack);
  return {
    record,
    snapshot(core, session) {
      const state = cores.get(core)?.state;
      const markerAt = state ? state.output.indexOf(readyMarker) : -1;
      let focusReporting = null;
      let bracketedPaste = null;
      if (state) {
        try {
          focusReporting = state.parser.isFocusReporting();
          bracketedPaste = state.parser.isBracketedPaste();
        } catch {
          observationUnavailable = true;
        }
      }
      const sessions = ptys.slice(0, 4).map((pty) => {
        let pid = null;
        try {
          const value = pty.pid;
          if (Number.isSafeInteger(value)) pid = value;
        } catch {
          observationUnavailable = true;
        }
        const output = typeof pty.output === "string" ? pty.output : "";
        const writes = [];
        let size = 0;
        let writesTruncated = !Array.isArray(pty.writes);
        for (const chunk of (pty.writes ?? []).slice(0, 32)) {
          if (
            typeof chunk !== "string" ||
            size + Buffer.byteLength(chunk, "utf8") > 2048
          ) {
            writesTruncated = true;
            break;
          }
          size += Buffer.byteLength(chunk, "utf8");
          writes.push(chunk);
        }
        if ((pty.writes?.length ?? 0) > 32) writesTruncated = true;
        return {
          pid,
          selected: pty === session,
          exited: typeof pty.exited === "boolean" ? pty.exited : null,
          outputTail: output.slice(-2048),
          outputTailTruncated: output.length > 2048,
          writes,
          writesTruncated,
        };
      });
      return {
        classification: "startup-readiness-diagnostic-not-qualification",
        coreId: id(core),
        observedCoreIds: [...cores.keys()].slice(0, 4).map(id),
        coresTruncated: cores.size > 4,
        selectedIndex: ptys.indexOf(session),
        sessions,
        sessionsTruncated: ptys.length > 4,
        checks: {
          coreObserved: !!state,
          observerValid: state ? !state.invalid : null,
          oneSession: ptys.length === 1,
          selectedSession: !!session && ptys[0] === session,
          sessionLive: session ? !session.exited : null,
          markerSeen: state ? !!state.markerEnd : null,
          acknowledgedAll: state ? state.ackEnd >= state.sentEnd : null,
          noPartialPrivateMode: state
            ? !/\u001b(?:\[(?:\?[0-9;]*)?)?$/.test(state.output)
            : null,
          focusResetBeforeMarker:
            state && markerAt >= 0
              ? state.output.slice(0, markerAt).includes(focusReset)
              : null,
          outerFocusEnableAfterReset:
            state && markerAt >= 0
              ? outerFocusEnableAfterReset(state.output, markerAt)
              : null,
          focusReporting,
          bracketedPaste,
        },
        mainOutput: state
          ? {
              sentEnd: state.sentEnd,
              ackEnd: state.ackEnd,
              markerEnd: state.markerEnd,
              invalidReason: state.invalidReason,
              outputTail: state.output.slice(-2048),
              outputTailTruncated: state.output.length > 2048,
            }
          : null,
        events: [...events],
        eventCount,
        eventsTruncated,
        observationUnavailable,
      };
    },
    ready(core, session) {
      const state = cores.get(core)?.state;
      if (
        !state ||
        state.invalid ||
        ptys.length !== 1 ||
        ptys[0] !== session ||
        session.exited ||
        !state.markerEnd ||
        state.ackEnd < state.sentEnd
      )
        return false;
      const markerAt = state.output.indexOf(readyMarker);
      return (
        !/\u001b(?:\[(?:\?[0-9;]*)?)?$/.test(state.output) &&
        outerFocusEnableAfterReset(state.output, markerAt) &&
        state.parser.isFocusReporting() &&
        !state.parser.isBracketedPaste()
      );
    },
    dispose() {
      app.removeListener("browser-window-created", created);
      ipcMain.removeListener("terminal:output-ack", ack);
      for (const [core, { own, send }] of cores) {
        if (core.send !== send) continue;
        if (own) Object.defineProperty(core, "send", own);
        else delete core.send;
      }
      cores.clear();
    },
  };
}
module.exports = { startWindowsProbeReadiness };
