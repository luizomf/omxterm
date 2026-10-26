import { spawn, type IPty } from "node-pty";
import type { EventEmitter } from "node:events";
import { spawnFixtureProcess } from "./native-fixture-ownership";

// beta.18 forwards this socket event after updating the public PID, before any
// payload. Keep this pinned, untyped dependency detail inside the PTY adapter.
type ReadyPty = IPty & Pick<EventEmitter, "on" | "removeListener">;

export function spawnFixturePty(
  ...args: [
    ...Parameters<typeof spawn>,
    {
      readonly spawn?: typeof spawn;
      readonly registered?: (terminal: IPty) => void;
    }?,
  ]
): IPty {
  const [file, argv, options, ownership] = args;
  return spawnFixtureProcess(
    () => (ownership?.spawn ?? spawn)(file, argv, options),
    (terminal, exited, ready) => {
      const pinned = terminal as ReadyPty;
      const onReady = () => {
        ready();
      };
      const subscription = terminal.onExit(exited);
      if (terminal.pid <= 0) pinned.on("ready_datapipe", onReady);
      return () => {
        subscription.dispose();
        pinned.removeListener("ready_datapipe", onReady);
      };
    },
    ownership?.registered,
  );
}
