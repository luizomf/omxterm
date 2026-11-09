import { startTerminalWindow } from "../../src/renderer/start-terminal-window";
import {
  installPerformanceBenchmark,
  recordOutput,
  recordSession,
} from "./performance-benchmark-surface";

// Production renderer composition with fixture-only observation. The bridge is
// passed through unchanged except for recording the session identity the
// application already received, so the fixture can address an exact tab over the
// same input channel a Surface uses.
installPerformanceBenchmark();

const bridge = window.omxterm;
const terminal: typeof bridge.terminal = {
  ...bridge.terminal,
  async start(...arguments_) {
    const sessionId = await bridge.terminal.start(...arguments_);
    recordSession(sessionId);
    return sessionId;
  },
  onOutput(listener) {
    return bridge.terminal.onOutput((sessionId, data, end) => {
      recordOutput(sessionId, end);
      listener(sessionId, data, end);
    });
  },
};

startTerminalWindow({ ...bridge, terminal });
