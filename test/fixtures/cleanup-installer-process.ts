import { readFile, rm } from "node:fs/promises";

// Independent cleanup for the Linux CLI fixtures, not production cleanup.
// Inspect only the PID registered by our synthetic runtime; never scan processes.
export async function cleanupInstallerProcess(
  root: string,
  pidFile: string,
  runtime: string,
) {
  let pid: number;
  try {
    pid = Number(await readFile(pidFile, "utf8"));
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    throw new Error(`Fixture registration missing; state retained at ${root}`, {
      cause,
    });
  }
  if (!Number.isSafeInteger(pid) || pid <= 0)
    throw new Error(`Invalid fixture PID; state retained at ${root}`);
  const commandFile = `/proc/${pid}/cmdline`;
  const deadline = Date.now() + 2000;
  let signaled = false;
  while (true) {
    let command: string;
    try {
      command = await readFile(commandFile, "utf8");
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
      break;
    }
    // Empty cmdline means a zombie: do not signal it or infer reaping.
    if (command && !command.split("\0").includes(runtime))
      throw new Error(
        `Fixture PID identity changed; state retained at ${root}`,
      );
    if (command && !signaled) {
      try {
        process.kill(pid, "SIGKILL");
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== "ESRCH") throw cause;
      }
      signaled = true;
    }
    if (Date.now() >= deadline)
      throw new Error(
        `Fixture termination unconfirmed; state retained at ${root}`,
      );
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await rm(root, { recursive: true, force: true });
}
