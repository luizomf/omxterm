import type { Terminal } from "@xterm/xterm";

interface TerminalTitleEventHandlers {
  readonly onTitleRequest?: (request: string) => void;
  readonly onBell?: () => void;
}

export function registerTerminalTitleEvents(
  terminal: Pick<Terminal, "parser" | "onBell">,
  handlers: TerminalTitleEventHandlers,
): { dispose(): void } {
  const consumeTitleRequest = (request: string) => {
    handlers.onTitleRequest?.(request);
    return true;
  };
  const subscriptions = [
    terminal.parser.registerOscHandler(0, consumeTitleRequest),
    terminal.parser.registerOscHandler(2, consumeTitleRequest),
    terminal.parser.registerCsiHandler(
      { final: "t" },
      (params) => params.length === 1 && (params[0] === 20 || params[0] === 21),
    ),
    terminal.onBell(() => handlers.onBell?.()),
  ];

  return {
    dispose() {
      for (const subscription of subscriptions) subscription.dispose();
    },
  };
}
