import type { spawn, IPty } from "node-pty";
import { createRequire } from "node:module";
import type { EventEmitter } from "node:events";
import { registerFixtureProcess } from "./native-fixture-ownership";

// On Windows, node-pty publishes the PID only after its data pipe is ready.
type ReadyPty = IPty & Pick<EventEmitter, "once">;

export function spawnFixturePty(
  ...args: [...Parameters<typeof spawn>, { readonly spawn?: typeof spawn }?]
): IPty {
  const [file, argv, options, ownership] = args;
  // Do not instantiate node-pty's ESM namespace before a fixture CJS hook.
  const spawnPty =
    ownership?.spawn ??
    (
      createRequire(
        typeof __filename === "string" ? __filename : import.meta.url,
      )("node-pty") as { spawn: typeof spawn }
    ).spawn;
  const terminal = spawnPty(file, argv, options);
  if (terminal.pid > 0) registerFixtureProcess(terminal.pid);
  else
    (terminal as ReadyPty).once("ready_datapipe", () => {
      if (terminal.pid > 0) registerFixtureProcess(terminal.pid);
    });
  return terminal;
}
