// Opt-in, synthetic-fixture evidence only. No production terminal logging.
// Observation never admits, retries, redirects or completes semantic input.
function startInsertDiagnostic({ app, ipcMain, ptys }) {
  const events = [];
  const restorers = [];
  const observedHandlerIds = [];
  let checkpoint;
  let truncated = false;
  let observationUnavailable = false;
  let disposed = false;
  let nextRequestId = 1;
  const record = (value) => {
    if (!checkpoint || disposed) return;
    if (events.length >= 64) {
      truncated = true;
      return;
    }
    events.push(value);
  };
  const id = (contents) =>
    Number.isSafeInteger(contents?.id) ? contents.id : null;
  const reply = (event, value) => {
    if (!value || typeof value !== "object") return;
    if (value.kind === "started")
      record({ kind: "reply-started", senderId: id(event?.sender) });
    else if (value.kind === "finished")
      record({
        kind: "reply-finished",
        senderId: id(event?.sender),
        available:
          typeof value.available === "boolean" ? value.available : null,
      });
  };
  const created = (_event, contents) => {
    if (restorers.length >= 64) {
      observationUnavailable = true;
      return;
    }
    try {
      const scoped = contents.ipc;
      if (!scoped || typeof scoped.handle !== "function") {
        observationUnavailable = true;
        return;
      }
      const previous = scoped.handle;
      const own = Object.getOwnPropertyDescriptor(scoped, "handle");
      function handle(channel, handler) {
        if (channel !== "extension-view:request")
          return Reflect.apply(previous, this, arguments);
        const registered = Reflect.apply(previous, this, [
          channel,
          function (...args) {
            const value = args[1];
            if (
              !value ||
              typeof value !== "object" ||
              value.operation !== "terminal.semanticInput.v1"
            )
              return Reflect.apply(handler, this, args);
            const text = typeof value.text === "string" ? value.text : "";
            const length = Buffer.byteLength(text, "utf8");
            const senderId = id(args[0]?.sender);
            const requestId =
              checkpoint && !disposed && nextRequestId <= 64
                ? nextRequestId++
                : null;
            if (checkpoint && !disposed && requestId === null) truncated = true;
            if (requestId !== null)
              record({
                kind: "request",
                senderId,
                requestId,
                intent:
                  value.intent === "insert" || value.intent === "run"
                    ? value.intent
                    : "invalid",
                preview:
                  typeof value.preview === "boolean" ? value.preview : null,
                textBytes: length,
                ...(length <= 256 ? { text } : { textTruncated: true }),
              });
            try {
              const result = Reflect.apply(handler, this, args);
              Promise.resolve(result).then(
                (resultValue) => {
                  if (requestId !== null)
                    record({
                      kind: "request-resolved",
                      senderId,
                      requestId,
                      ok: resultValue?.ok === true,
                    });
                },
                () => {
                  if (requestId !== null)
                    record({ kind: "request-rejected", senderId, requestId });
                },
              );
              return result;
            } catch (error) {
              if (requestId !== null)
                record({ kind: "request-threw", senderId, requestId });
              throw error;
            }
          },
        ]);
        if (observedHandlerIds.length < 64)
          observedHandlerIds.push(id(contents));
        else observationUnavailable = true;
        return registered;
      }
      scoped.handle = handle;
      if (scoped.handle !== handle) throw Error("Cannot observe handler");
      restorers.push(() => {
        if (scoped.handle !== handle) return;
        if (own) Object.defineProperty(scoped, "handle", own);
        else delete scoped.handle;
      });
    } catch {
      observationUnavailable = true;
    }
  };
  app.on("web-contents-created", created);
  ipcMain.on("terminal:semantic-reply", reply);
  return {
    checkpoint({ session, expected, viewId, coreId, focusBefore }) {
      if (checkpoint) throw Error("Diagnostic checkpoint already set");
      checkpoint = {
        session,
        expected,
        viewId,
        coreId,
        focusBefore,
        offsets: new Map(
          ptys.slice(0, 4).map((pty) => [pty, pty.writes.length]),
        ),
      };
    },
    snapshot() {
      if (!checkpoint) throw Error("Diagnostic checkpoint absent");
      let remaining = 16 * 1024;
      const sessions = ptys.slice(0, 4).map((pty) => {
        const offset = checkpoint.offsets.get(pty) ?? 0;
        const writes = [];
        let writesTruncated = false;
        for (const chunk of pty.writes.slice(offset, offset + 64)) {
          if (typeof chunk !== "string") {
            writesTruncated = true;
            break;
          }
          const bytes = Buffer.byteLength(chunk, "utf8");
          if (bytes > remaining) {
            writesTruncated = true;
            break;
          }
          remaining -= bytes;
          writes.push(chunk);
        }
        if (pty.writes.length - offset > 64) writesTruncated = true;
        return {
          pid: pty.pid,
          selected: pty === checkpoint.session,
          offset,
          totalWrites: pty.writes.length,
          writes,
          writesTruncated,
          outputTail: pty.output.slice(-4096),
          outputTailTruncated: pty.output.length > 4096,
          exited: pty.exited,
        };
      });
      return {
        classification: "synthetic-insert-diagnostic-not-qualification",
        expected: checkpoint.expected,
        viewId: checkpoint.viewId,
        coreId: checkpoint.coreId,
        focusBefore: checkpoint.focusBefore,
        selectedIndex: ptys.indexOf(checkpoint.session),
        sessions,
        sessionsTruncated: ptys.length > 4,
        events: [...events],
        eventsTruncated: truncated,
        observedHandlerIds: [...observedHandlerIds],
        observationUnavailable,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      app.removeListener("web-contents-created", created);
      ipcMain.removeListener("terminal:semantic-reply", reply);
      for (const restore of restorers) {
        try {
          restore();
        } catch {
          // Diagnostic cleanup must not replace the scenario failure.
        }
      }
    },
  };
}
module.exports = { startInsertDiagnostic };
