import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { captureSshTarget, sshArguments } from "../shared/ssh-target.js";
import type { LaunchRequest } from "./launch-request.js";

export interface SshLaunch {
  request: Extract<LaunchRequest, { kind: "explicit-command" }>;
  title: string;
}
export async function findSsh(
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): Promise<string | undefined> {
  // Windows ships OpenSSH as ssh.exe; a literal PATHEXT search is not needed.
  const name = platform === "win32" ? "ssh.exe" : "ssh";
  for (const directory of (environment.PATH ?? "").split(path.delimiter)) {
    if (!path.isAbsolute(directory)) continue;
    const candidate = path.join(directory, name);
    try {
      if (!(await stat(candidate)).isFile()) continue;
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* Try the next absolute application PATH directory. */
    }
  }
  return undefined;
}

/** Store authorization and synchronous local/core transfer are separate points.
 * The caller's admit callback runs commit without an intervening await after its
 * final local-lifetime check. Records thereafter belong solely to core. */
export function createSshTerminalLaunch<Owner extends object>(options: {
  lookup(): Promise<string | undefined>;
  alive(owner: Owner): boolean;
  notify(
    owner: Owner,
    message: {
      action: "open-ssh";
      token: string;
      sourceView: string;
      title: string;
    },
  ): void;
}) {
  type Pending = {
    owner: Owner;
    view: object;
    launch: SshLaunch;
    reply(value: boolean): void;
    timer: ReturnType<typeof setTimeout>;
  };
  const pending = new Map<string, Pending>();
  let stopped = false;
  const remove = (token: string) => {
    const record = pending.get(token);
    if (record) {
      clearTimeout(record.timer);
      pending.delete(token);
    }
    return record;
  };
  return {
    async open(
      owner: Owner,
      view: object,
      sourceView: string,
      value: unknown,
      admit: (commit: () => void) => Promise<void>,
    ) {
      const target = captureSshTarget(value);
      if (target.host.includes(":") && isIP(target.host) !== 6)
        throw new TypeError("Invalid SSH target");
      const executable = await options.lookup();
      if (!executable) return { ok: false, error: "ssh-not-found" };
      const token = randomUUID();
      let resolve!: (value: boolean) => void;
      const accepted = new Promise<boolean>((done) => {
        resolve = done;
      });
      await admit(() => {
        if (stopped || !options.alive(owner)) throw new Error("unavailable");
        if (
          pending.size >= 32 ||
          [...pending.values()].some((record) => record.view === view)
        )
          throw new Error("busy");
        const launch: SshLaunch = {
          request: {
            kind: "explicit-command",
            executable,
            arguments: sshArguments(target),
          },
          title: `SSH · ${target.host}`.slice(0, 256),
        };
        const timer = setTimeout(() => {
          remove(token)?.reply(false);
        }, 60_000);
        pending.set(token, { owner, view, launch, reply: resolve, timer });
        try {
          options.notify(owner, {
            action: "open-ssh",
            token,
            sourceView,
            title: launch.title,
          });
        } catch {
          remove(token)?.reply(false);
        }
      });
      return (await accepted)
        ? { ok: true, status: "accepted" }
        : { ok: false, error: "outcome-unknown" };
    },
    acknowledge(owner: Owner, token: string, accepted: boolean) {
      const record = pending.get(token);
      if (!record || record.owner !== owner) return;
      record.reply(accepted);
      if (!accepted) remove(token);
    },
    consume(owner: Owner, token: string): SshLaunch {
      const record = pending.get(token);
      if (!record || record.owner !== owner || stopped || !options.alive(owner))
        throw new Error("Unavailable SSH pane");
      remove(token);
      record.reply(true);
      return record.launch;
    },
    cancel(owner: Owner, token?: string) {
      for (const [id, record] of pending)
        if (record.owner === owner && (token === undefined || token === id))
          remove(id)?.reply(false);
    },
    dispose() {
      stopped = true;
      for (const token of pending.keys()) remove(token)?.reply(false);
    },
  };
}
