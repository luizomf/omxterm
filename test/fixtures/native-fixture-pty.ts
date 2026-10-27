import type { spawn, IPty } from "node-pty";
import { createRequire } from "node:module";
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
    // Do not instantiate node-pty's ESM namespace before a fixture CJS hook.
    // Explicit spawns also keep controlled callers entirely addon-free.
    () =>
      (
        ownership?.spawn ??
        (
          createRequire(
            typeof __filename === "string" ? __filename : import.meta.url,
          )("node-pty") as { spawn: typeof spawn }
        ).spawn
      )(file, argv, options),
    (terminal, exited, ready, failedStart) => {
      const pinned = terminal as ReadyPty;
      const onReady = () => {
        ready();
      };
      const subscription = terminal.onExit((event) => {
        // Only prepared beta.18 Windows agent errors seal deferred connect
        // admission before this event. Unix's shared flag is an actual-child
        // exit, not failed-start acquisition. Neither flag proves no child.
        if (
          process.platform === "win32" &&
          (event as typeof event & { execFailed?: boolean }).execFailed === true
        )
          failedStart();
        else exited();
      });
      if (terminal.pid <= 0) pinned.on("ready_datapipe", onReady);
      return () => {
        subscription.dispose();
        pinned.removeListener("ready_datapipe", onReady);
      };
    },
    ownership?.registered,
  );
}
