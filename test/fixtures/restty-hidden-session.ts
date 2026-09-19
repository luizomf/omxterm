import { createElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import type {
  TerminalSessionId,
  TerminalSize,
} from "../../src/shared/terminal-contract";

export function hiddenFixtureSession(id: TerminalSessionId) {
  let listener: Parameters<TerminalBridge["onOutput"]>[0] | undefined;
  let end = 0;
  const state = {
    ready: false,
    closed: false,
    writes: [] as string[],
    sizes: [] as TerminalSize[],
    acknowledgements: [] as number[],
  };
  // This fixture supplies only the bridge routes used by the production Adapter.
  // No test-only output queue replaces its synchronous delivery/ACK behavior.
  const bridge = {
    async start() {
      state.ready = true;
      return id;
    },
    onOutput(next: Parameters<TerminalBridge["onOutput"]>[0]) {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
    onExit() {
      return () => undefined;
    },
    input(_id: TerminalSessionId, data: string) {
      state.writes.push(data);
    },
    resize(_id: TerminalSessionId, size: TerminalSize) {
      state.sizes.push(size);
    },
    close() {
      state.closed = true;
    },
    acknowledgeOutput(_id: TerminalSessionId, position: number) {
      state.acknowledgements.push(position);
    },
  } as unknown as TerminalBridge;
  return {
    writes: state.writes,
    sizes: state.sizes,
    state,
    adapter: createElectronTerminalAdapter(bridge),
    output(data: string) {
      end += new TextEncoder().encode(data).length;
      listener?.(id, data, end);
      return state.acknowledgements.at(-1) === end;
    },
  };
}
