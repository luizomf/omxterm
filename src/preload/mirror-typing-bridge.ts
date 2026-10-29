import {
  isMirrorCommand,
  isMirrorReply,
  isMirrorKeyInput,
  isMirrorStopReason,
  mirrorTypingIpc,
  type MirrorTypingBridge,
} from "../shared/mirror-typing";
import { isLayoutToken } from "../shared/terminal-layout";

export function createMirrorTypingBridge(ipc: {
  send(channel: string, value: unknown): void;
  on(
    channel: string,
    listener: (event: unknown, value: unknown) => void,
  ): unknown;
  removeListener(
    channel: string,
    listener: (event: unknown, value: unknown) => void,
  ): unknown;
}): MirrorTypingBridge {
  return {
    onCommand(callback) {
      const listener = (_event: unknown, value: unknown) => {
        if (isMirrorCommand(value)) callback(value);
      };
      ipc.on(mirrorTypingIpc.command, listener);
      return () => {
        ipc.removeListener(mirrorTypingIpc.command, listener);
      };
    },
    reply(value) {
      if (!isMirrorReply(value)) throw new TypeError("Invalid mirror reply");
      ipc.send(mirrorTypingIpc.reply, value);
    },
    input(value) {
      if (!isMirrorKeyInput(value)) throw new TypeError("Invalid mirror input");
      ipc.send(mirrorTypingIpc.input, value);
    },
    stop(context, reason) {
      if (!isLayoutToken(context) || !isMirrorStopReason(reason))
        throw new TypeError("Invalid mirror stop");
      ipc.send(mirrorTypingIpc.stop, { context, reason });
    },
  };
}
