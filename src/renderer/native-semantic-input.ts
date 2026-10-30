import type { SemanticInputBridge } from "../shared/semantic-input";
import type { createSemanticInput } from "./semantic-input";

/** Bridges native admission to the same window-owned input/preview as built-in UI. */
export function subscribeNativeSemanticInput(
  bridge: SemanticInputBridge,
  input: ReturnType<typeof createSemanticInput>,
  selectionRevision: () => number,
  restoreSourceFocus: (id: string) => boolean,
) {
  let pending: { id: string; abort: AbortController } | undefined;
  let disposed = false;
  const remove = bridge.onCommand((command) => {
    if (disposed) return;
    if (command.kind === "revoke") {
      if (pending?.id === command.id) pending.abort.abort();
      return;
    }
    if (pending?.id === command.id) return;
    if (pending || command.revision !== selectionRevision()) {
      bridge.reply({ kind: "finished", id: command.id, available: false });
      return;
    }
    const current = { id: command.id, abort: new AbortController() };
    pending = current;
    const request = command.input;
    const finish = (available: boolean) => {
      if (pending === current) pending = undefined;
      if (!disposed)
        bridge.reply({ kind: "finished", id: current.id, available });
    };
    try {
      // request captures synchronously, before its overlay admission can await.
      const outcome = input.request(
        {
          name: request.title,
          body: request.text,
          execute: request.intent === "run",
          ...(request.description === undefined
            ? {}
            : { description: request.description }),
        },
        request.preview ? "preview" : request.intent,
        () =>
          !current.abort.signal.aborted && restoreSourceFocus(command.source),
        current.abort.signal,
      );
      bridge.reply({ kind: "started", id: current.id });
      void outcome.then(finish, () => finish(false));
    } catch {
      current.abort.abort();
      finish(false);
    }
  });
  return () => {
    if (disposed) return;
    disposed = true;
    remove();
    pending?.abort.abort();
    pending = undefined;
  };
}
