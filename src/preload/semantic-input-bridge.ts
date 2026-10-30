import {
  isSelectionRevision,
  isSemanticInputCommand,
  isSemanticInputReply,
  semanticInputIpc,
  type SemanticInputBridge,
} from "../shared/semantic-input";

export function createSemanticInputBridge(ipc: {
  send(channel: string, value: unknown): void;
  on(
    channel: string,
    listener: (event: unknown, value: unknown) => void,
  ): unknown;
  removeListener(
    channel: string,
    listener: (event: unknown, value: unknown) => void,
  ): unknown;
}): SemanticInputBridge {
  return {
    selection(revision) {
      if (!isSelectionRevision(revision))
        throw new TypeError("Invalid selection revision");
      ipc.send(semanticInputIpc.selection, revision);
    },
    onCommand(receive) {
      const listener = (_event: unknown, value: unknown) => {
        if (isSemanticInputCommand(value)) receive(value);
      };
      ipc.on(semanticInputIpc.command, listener);
      return () => ipc.removeListener(semanticInputIpc.command, listener);
    },
    reply(value) {
      if (!isSemanticInputReply(value))
        throw new TypeError("Invalid semantic input reply");
      ipc.send(semanticInputIpc.reply, value);
    },
  };
}
