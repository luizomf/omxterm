import {
  isCapturedLayout,
  isInitialLayout,
  isLayoutToken,
  layoutIpc,
  type CapturedLayout,
  type TerminalLayoutBridge,
} from "../shared/terminal-layout";

export function createTerminalLayoutBridge(ipc: {
  invoke(channel: string): Promise<unknown>;
  send(channel: string, value: unknown): void;
  on(
    channel: string,
    listener: (event: unknown, value: unknown) => void,
  ): unknown;
  removeListener(
    channel: string,
    listener: (event: unknown, value: unknown) => void,
  ): unknown;
}): TerminalLayoutBridge {
  return {
    async initial() {
      const plan = await ipc.invoke(layoutIpc.initial);
      if (plan !== null && !isInitialLayout(plan))
        throw new TypeError("Invalid initial terminal layout");
      return plan;
    },
    onCapture(capture) {
      const listener = (_event: unknown, id: unknown) => {
        if (!isLayoutToken(id)) return;
        let layout: CapturedLayout | null = null;
        let empty = false;
        try {
          const captured = capture();
          if (captured === null) empty = true;
          else if (isCapturedLayout(captured)) layout = captured;
        } catch {
          /* Refuse failed/over-budget capture without repair. */
        }
        ipc.send(
          layoutIpc.captured,
          empty ? { id, layout, empty } : { id, layout },
        );
      };
      ipc.on(layoutIpc.capture, listener);
      return () => {
        ipc.removeListener(layoutIpc.capture, listener);
      };
    },
    cancel(token) {
      if (!isLayoutToken(token)) throw new TypeError("Invalid layout token");
      ipc.send(layoutIpc.cancel, token);
    },
  };
}
