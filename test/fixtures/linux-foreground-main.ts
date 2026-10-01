import assert from "node:assert/strict";
import { createRequire } from "node:module";
import type { IPty } from "node-pty";
import { createLocalTerminalSession } from "../../src/main/local-terminal-session";
import { spawnFixturePty } from "./native-fixture-pty";

// Observe the real pinned addon independently of its public getter's fallback.
const require = createRequire(import.meta.url);
const { loadNativeModule } = require("node-pty/lib/utils") as {
  loadNativeModule(name: string): {
    module: { process(fd: number, tty: string): unknown };
  };
};
const native = loadNativeModule("pty").module;
let terminal: IPty | undefined;
function nativeForeground() {
  const unix = terminal as IPty & { fd: number; ptsName: string };
  return native.process(unix.fd, unix.ptsName);
}
let output = "";
let exited = false;
let resolveExit: (exit: { exitCode: number; signal: number }) => void;
const exit = new Promise<{ exitCode: number; signal: number }>((resolve) => {
  resolveExit = resolve;
});
const session = createLocalTerminalSession(
  (file, _args, options) => {
    // A hermetic interactive Bash avoids the account's login/startup programs.
    terminal = spawnFixturePty(file, ["--noprofile", "--norc", "-i"], options);
    return terminal;
  },
  {
    shell: "/bin/bash",
    platform: process.platform,
    homeDirectory: process.cwd(),
    applicationVersionProvider: { getVersion: () => "foreground-test" },
    environment: {
      ...process.env,
      PS1: "__OMXTERM_IDLE__",
      PROMPT_COMMAND: "",
    },
    onOutput(data) {
      output = (output + data).slice(-8192);
    },
    onExit(event) {
      exited = true;
      resolveExit(event);
    },
  },
);

async function observe(predicate: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.equal(exited, false, "Shell exited before the observation");
    assert.ok(Date.now() < deadline, "Native foreground observation timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

try {
  await observe(() => output.includes("__OMXTERM_IDLE__"));
  assert.equal(
    session.hasForegroundChildProcess(),
    false,
    "Idle shell must not be Busy",
  );
  output = "";
  session.write("stty -echo\r");
  await observe(() => output.includes("__OMXTERM_IDLE__"));

  output = "";
  session.write("/bin/sleep 0.3\r");
  await observe(() => nativeForeground() === "/bin/sleep");
  assert.equal(
    session.hasForegroundChildProcess(),
    true,
    "Ordinary foreground command must be Busy",
  );
  await observe(() => output.includes("__OMXTERM_IDLE__"));
  assert.equal(session.hasForegroundChildProcess(), false);

  output = "";
  // A short-lived group leader exits while the pipeline's sleep is still live.
  // No native lookup is mocked or forced to throw, and no process tree is read.
  session.write("/bin/true | /bin/sleep 2\r");
  await observe(() => nativeForeground() === undefined);
  process.kill(terminal!.pid, 0);
  assert.equal(
    session.hasForegroundChildProcess(),
    true,
    "Unavailable native foreground must be Busy",
  );
  assert.equal(terminal!.process as unknown, undefined);
  await observe(() => output.includes("__OMXTERM_IDLE__"));
  assert.equal(
    session.hasForegroundChildProcess(),
    false,
    "Pipeline completion must restore idle",
  );
  session.write("exit 0\r");
  assert.deepEqual(await exit, { exitCode: 0, signal: 0 });
  assert.equal(session.hasForegroundChildProcess(), false);
  process.stdout.write("__OMXTERM_FOREGROUND_PASS__\n");
} finally {
  session.close();
  output = "";
}
