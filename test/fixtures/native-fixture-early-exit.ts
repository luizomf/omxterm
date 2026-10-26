import { spawnFixturePty } from "./native-fixture-pty";
import { existsSync, writeFileSync } from "node:fs";
import { fixtureProcesses } from "./native-fixture-processes";

// The readiness record is outside the disposable profile so the test can
// independently check for an escaped PTY even if the supervisor removes it.
const ready = process.argv[2]!;
spawnFixturePty(
  process.execPath,
  [
    "-e",
    `process.on('SIGHUP',()=>{}); process.on('SIGTERM',()=>{});
     require('node:fs').writeFileSync(${JSON.stringify(`${ready}.started`)}, 'ready');
     setInterval(()=>{},1000);`,
  ],
  { name: "xterm-256color", cols: 80, rows: 24, env: process.env },
  {
    registered(terminal) {
      const identity = fixtureProcesses().find(
        (row) => row.pid === terminal.pid,
      );
      if (!identity) throw new Error("Cannot identify the regression PTY");
      writeFileSync(ready, JSON.stringify(identity));
    },
  },
);
const deadline = Date.now() + 10_000;
const exitWhenReady = () => {
  if (existsSync(ready) && existsSync(`${ready}.started`)) process.exit(0);
  if (Date.now() >= deadline) process.exit(2);
  setTimeout(exitWhenReady, 10);
};
exitWhenReady();
