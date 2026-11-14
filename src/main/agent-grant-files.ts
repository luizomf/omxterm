import { createHash, randomUUID } from "node:crypto";
import { renameSync, unlinkSync } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  readdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { AGENT_GRANT_VERSION } from "../shared/agent-api";
import { socketIsLive } from "./agent-endpoint";

export function agentApiDirectory(profile: string) {
  return path.join(profile, "agent-api");
}
/**
 * Where a profile's endpoint listens: a socket in the profile on macOS and
 * Linux, a named pipe named after the profile path on Windows.
 */
export function agentEndpointPath(
  profile: string,
  platform: NodeJS.Platform = process.platform,
) {
  if (platform !== "win32")
    return path.join(agentApiDirectory(profile), "ctl.sock");
  const hash = createHash("sha256").update(profile).digest("hex");
  return `\\\\.\\pipe\\omxterm-agent-${hash.slice(0, 16)}`;
}

/**
 * A profile's grant credentials (ADR 0052): one user-only file per granted
 * window, which exists while the grant does and which OMXTerm never reads.
 */
export function createGrantFiles(
  profile: string,
  instance: string,
  platform: NodeJS.Platform = process.platform,
) {
  const socketPath = agentEndpointPath(profile, platform);
  const directory = path.join(agentApiDirectory(profile), "grants");
  const file = (windowId: number) => path.join(directory, `${windowId}.json`);
  return {
    socketPath,
    async write(windowId: number, token: Buffer) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      if (!(await lstat(directory)).isDirectory())
        throw new Error("The grants path isn't a directory");
      await chmod(directory, 0o700);
      // Written whole under a fresh name, then moved into place.
      const temporary = path.join(
        directory,
        `.${windowId}.${randomUUID()}.tmp`,
      );
      await writeFile(
        temporary,
        `${JSON.stringify({
          version: AGENT_GRANT_VERSION,
          instance,
          window: windowId,
          endpoint: socketPath,
          token: token.toString("hex"),
        })}\n`,
        { mode: 0o600, flag: "wx" },
      );
      renameSync(temporary, file(windowId));
    },
    remove(windowId: number) {
      try {
        unlinkSync(file(windowId));
      } catch {
        // Already gone.
      }
    },
    /** Removes a crashed run's socket and credentials, never a live one's. */
    async removeLeftovers() {
      if (await socketIsLive(socketPath)) return;
      // A pipe goes away with the process that held it.
      if (platform !== "win32") await unlink(socketPath).catch(() => {});
      const names = await readdir(directory).catch(() => [] as string[]);
      for (const name of names)
        if (/^(\d+\.json|\.\d+\.[0-9a-f-]{36}\.tmp)$/u.test(name))
          await unlink(path.join(directory, name)).catch(() => {});
    },
  };
}
