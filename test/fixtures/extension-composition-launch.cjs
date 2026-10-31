// On Windows the native supervisor owns this launcher and its descendants.
// Keep the actual Electron ChildProcess and both pipes until exit AND EOF.
const { spawn } = require("node:child_process");

const [executable, ...args] = process.argv.slice(2);
if (!executable) throw new Error("Missing composition executable");
const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"] });
const limit = 1024 * 1024;
const output = { stdout: [], stderr: [] };
const size = { stdout: 0, stderr: 0 };
const receipt = {
  exitCode: null,
  signal: null,
  exited: false,
  closed: false,
  stdoutEnded: false,
  stderrEnded: false,
  truncated: false,
};
for (const name of ["stdout", "stderr"]) {
  child[name].on("data", (chunk) => {
    const remaining = Math.max(0, limit - size[name]);
    if (chunk.length > remaining) receipt.truncated = true;
    if (remaining) output[name].push(chunk.subarray(0, remaining));
    size[name] += chunk.length;
  });
  child[name].once("end", () => {
    receipt[`${name}Ended`] = true;
  });
  child[name].once("error", () => {});
}
child.once("error", () => {});
child.once("exit", (code, signal) => {
  receipt.exitCode = code;
  receipt.signal = signal;
  receipt.exited = true;
});
child.once("close", () => {
  receipt.closed = true;
  process.stdout.write(Buffer.concat(output.stdout));
  process.stderr.write(Buffer.concat(output.stderr));
  process.stdout.write(
    `\nCOMPOSITION_LAUNCH_RESULT:${JSON.stringify(receipt)}\n`,
  );
  if (
    !receipt.exited ||
    receipt.exitCode !== 0 ||
    receipt.signal !== null ||
    !receipt.stdoutEnded ||
    !receipt.stderrEnded ||
    receipt.truncated
  )
    process.exitCode = 1;
});
