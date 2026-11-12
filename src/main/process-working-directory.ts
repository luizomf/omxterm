import { execFile } from "node:child_process";
import { readlink } from "node:fs/promises";
import { isLayoutPath } from "../shared/terminal-layout";

export type ProcessDirectories = (
  processIds: readonly number[],
) => Promise<ReadonlyMap<number, string>>;

const validProcessId = (value: number) =>
  Number.isSafeInteger(value) && value > 0;

/**
 * Reads the working directory of shell processes, read-only and without
 * touching the shell (ADR 0013). Linux reads `/proc/<pid>/cwd`. macOS asks
 * `lsof` once for every process requested in the same turn, so capturing many
 * windows costs one spawn. Other platforms (Windows) return nothing.
 */
export function createProcessDirectoryReader(
  options: {
    platform?: string;
    readLink?: (path: string) => Promise<string>;
    /** Resolves with stdout bytes, or rejects when the tool failed or timed out. */
    run?: (file: string, args: string[]) => Promise<Buffer>;
  } = {},
): ProcessDirectories {
  const platform = options.platform ?? process.platform;
  const readLink = options.readLink ?? ((path) => readlink(path));
  const run =
    options.run ??
    ((file, args) =>
      new Promise<Buffer>((resolve, reject) => {
        execFile(
          file,
          args,
          {
            timeout: 2000,
            maxBuffer: 1024 * 1024,
            encoding: "buffer",
            // Without a UTF-8 locale (an app started from Finder or the Dock),
            // lsof prints non-ASCII bytes as \xNN.
            env: { ...process.env, LC_ALL: "en_US.UTF-8" },
          },
          // lsof exits 1 when a process has gone; that's still an answer.
          (error, stdout) =>
            !error || (error.code === 1 && !error.killed && !error.signal)
              ? resolve(stdout)
              : reject(error),
        );
      }));
  const usable = (path: string) =>
    isLayoutPath(path, platform) ? path : undefined;

  if (platform === "linux")
    return async (processIds) => {
      const found = new Map<number, string>();
      await Promise.all(
        [...new Set(processIds)].filter(validProcessId).map(async (id) => {
          const path = usable(
            await readLink(`/proc/${id}/cwd`).catch(() => ""),
          );
          if (path) found.set(id, path);
        }),
      );
      return found;
    };

  if (platform === "darwin") {
    type Batch = { ids: Set<number>; result?: Promise<Map<number, string>> };
    let batch: Batch | undefined;
    const lookup = async (ids: Set<number>) => {
      const found = new Map<number, string>();
      // A failed run throws, so callers keep the folders they had.
      const output = await run("/usr/sbin/lsof", [
        "-a",
        "-n",
        "-P",
        "-w",
        "-d",
        "cwd",
        "-F",
        "pn",
        "-p",
        [...ids].join(","),
      ]);
      // Field output: `p<pid>` starts a process, `n<path>` names its cwd.
      // Latin-1 keeps one character per byte, so escapes and raw UTF-8 bytes
      // decode together below.
      let current: number | undefined;
      for (const line of output.toString("latin1").split("\n")) {
        if (line.startsWith("p")) current = Number(line.slice(1));
        else if (line.startsWith("n") && current !== undefined) {
          const path = usable(unescapeLsof(line.slice(1)) ?? "");
          if (path && ids.has(current)) found.set(current, path);
        }
      }
      return found;
    };
    return (processIds) => {
      const ids = processIds.filter(validProcessId);
      if (ids.length === 0) return Promise.resolve(new Map());
      if (!batch) {
        const pending: Batch = { ids: new Set() };
        // Everyone asking in this turn shares one lsof run.
        pending.result = new Promise<void>((resolve) =>
          setImmediate(resolve),
        ).then(() => {
          batch = undefined;
          return lookup(pending.ids);
        });
        batch = pending;
      }
      for (const id of ids) batch.ids.add(id);
      return batch.result!;
    };
  }

  return async () => new Map();
}

const escapes: Record<string, number> = {
  "\\": 0x5c,
  b: 0x08,
  f: 0x0c,
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
};

/**
 * Undoes lsof's name escaping (`\\`, `\t`, `\n`… and `\xNN` for bytes
 * it won't print) on a Latin-1 view of its output (one character per byte),
 * then decodes the bytes as UTF-8. Undefined when anything is left that can't
 * be decoded exactly.
 */
export function unescapeLsof(name: string): string | undefined {
  const bytes: number[] = [];
  for (let index = 0; index < name.length; index++) {
    const code = name.charCodeAt(index);
    if (code > 0xff) return undefined;
    if (name[index] !== "\\") {
      bytes.push(code);
      continue;
    }
    const next = name[index + 1];
    if (
      next === "x" &&
      /^[0-9a-f]{2}$/iu.test(name.slice(index + 2, index + 4))
    ) {
      bytes.push(Number.parseInt(name.slice(index + 2, index + 4), 16));
      index += 3;
    } else if (next !== undefined && next in escapes) {
      bytes.push(escapes[next]!);
      index += 1;
    } else return undefined;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(bytes),
    );
  } catch {
    return undefined;
  }
}
