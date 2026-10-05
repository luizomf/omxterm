import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
} from "node:fs/promises";
import type { Stats } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fixtureProcesses } from "./native-fixture-processes";
import { FIXTURE_PROCESS_DIRECTORY } from "./native-fixture-ownership";

const nativeFiles = [
  "supervisor-ready",
  "native-bootstrap-pending",
  "native-process.json",
  "native-exit.json",
  "native-stdout",
  "native-stderr",
  "native-cancel.json",
];

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function processIdentity(
  value: unknown,
): value is { pid: number; parent: number; identity: string } {
  return (
    object(value) &&
    Number.isSafeInteger(value.pid) &&
    // CIM includes the System Idle Process; it is valid inventory, not a caller.
    Number(value.pid) >= 0 &&
    Number.isSafeInteger(value.parent) &&
    Number(value.parent) >= 0 &&
    typeof value.identity === "string" &&
    /^[1-9]\d*$/u.test(value.identity)
  );
}

function localAbsolute(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !value.includes("\0") &&
    path.isAbsolute(value) &&
    !/^[\\/]{2}/u.test(value)
  );
}

function recognizedRequest(
  request: unknown,
  root: string,
  evidence: string,
): request is { parent: { pid: number; identity: string } } {
  return (
    object(request) &&
    request.externalChild === true &&
    processIdentity(request.parent) &&
    request.parent.pid > 0 &&
    localAbsolute(request.root) &&
    path.resolve(request.root) === root &&
    localAbsolute(request.evidencePath) &&
    path.resolve(request.evidencePath) === evidence &&
    typeof request.executable === "string" &&
    request.executable.length > 0 &&
    Array.isArray(request.args) &&
    request.args.every((arg) => typeof arg === "string") &&
    typeof request.timeout === "number" &&
    Number.isFinite(request.timeout) &&
    request.timeout > 0 &&
    typeof request.cancellationToken === "string" &&
    request.cancellationToken.length > 0 &&
    (request.completionFile === undefined ||
      typeof request.completionFile === "string") &&
    Object.keys(request).every((key) =>
      [
        "root",
        "evidencePath",
        "executable",
        "args",
        "timeout",
        "cancellationToken",
        "parent",
        "externalChild",
        "completionFile",
      ].includes(key),
    )
  );
}

function sameIdentity(first: Stats, second: Stats): boolean {
  return (
    first.dev === second.dev &&
    first.ino === second.ino &&
    first.size === second.size &&
    first.mtimeMs === second.mtimeMs &&
    first.ctimeMs === second.ctimeMs &&
    !second.isSymbolicLink()
  );
}

class RecoveryRefusal extends Error {}

export function nativeFixtureRecoveryRefusal(
  reason: string,
  blockedPath: string,
): Error {
  // Only fixed classifications and the caller-selected scope reach diagnostics.
  // Never echo external JSON, native output or an underlying filesystem error.
  return new RecoveryRefusal(
    `Native fixture ownership unresolved; automatic recovery refused: ${reason}. ` +
      `Inspect ${blockedPath} and its retained ownership evidence; preserve the profile. ` +
      "See docs/development.md#fixture-ownership-and-cleanup",
  );
}

// Only releases a launch stop, not the previous supervisor's lifetime. In the
// recognized Windows protocol the dead parent was the sole native launcher.
// A late WMI supervisor can still settle/remove its old profile, but cannot spawn
// an external child. Never execute retained code or reclaim its profile here.
export async function recoverNativeFixtureReceipt(
  blockedPath: string,
  signal?: AbortSignal,
): Promise<void> {
  let phase = "retained files unavailable or invalid";
  function refuse(reason: string): never {
    throw nativeFixtureRecoveryRefusal(reason, blockedPath);
  }
  const snapshots = new Map<string, Stats>();
  const texts = new Map<string, string>();
  const inspect = async (name: string, directory = false) => {
    const stat = await lstat(name);
    if (
      stat.isSymbolicLink() ||
      (directory ? !stat.isDirectory() : !stat.isFile())
    )
      refuse("unrecognized profile or receipt filesystem entry");
    snapshots.set(name, stat);
  };
  const json = async (name: string): Promise<unknown> => {
    await inspect(name);
    const text = await readFile(name, "utf8");
    texts.set(name, text);
    return JSON.parse(text) as unknown;
  };
  const absent = async (name: string) => {
    try {
      await lstat(name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    refuse("bootstrap, supervisor progress or outcome evidence exists");
  };
  try {
    signal?.throwIfAborted();
    if (process.platform !== "win32")
      refuse("Windows pre-bootstrap recovery only");
    const receipt = await json(blockedPath);
    if (
      !object(receipt) ||
      Object.keys(receipt).some(
        (key) => !["root", "evidencePath"].includes(key),
      ) ||
      !localAbsolute(receipt.root) ||
      !localAbsolute(receipt.evidencePath)
    )
      refuse("unrecognized stop receipt");
    const root = path.resolve(receipt.root);
    const evidence = path.resolve(receipt.evidencePath);
    if (
      path.dirname(evidence) !== path.resolve(path.dirname(blockedPath)) ||
      evidence === path.resolve(blockedPath)
    )
      refuse("receipt evidence scope mismatch");
    await inspect(root, true);
    const relative = path.relative(
      await realpath(tmpdir()),
      await realpath(root),
    );
    if (
      !relative ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    )
      refuse("profile is outside the temporary fixture area");
    const request = await json(path.join(root, "supervisor-request.json"));
    if (!recognizedRequest(request, root, evidence))
      refuse("unrecognized or mismatched external-child request");
    await inspect(path.join(root, "native-fixture-supervisor.cjs"));
    const ownership = path.join(root, FIXTURE_PROCESS_DIRECTORY);
    await inspect(ownership, true);
    const unstarted = async () => {
      for (const name of nativeFiles) await absent(path.join(root, name));
      await absent(evidence);
      if ((await readdir(ownership)).length !== 0)
        refuse("process ownership entries remain");
    };
    await unstarted();
    phase = "process identity inspection unavailable";
    const rows = fixtureProcesses();
    if (!Array.isArray(rows) || !rows.every(processIdentity)) refuse(phase);
    const parent = request.parent;
    if (
      rows.some(
        (row) => row.pid === parent.pid && row.identity === parent.identity,
      )
    )
      refuse("authorizing parent incarnation is still alive");
    phase = "retained evidence changed during inspection";
    const recheck = async () => {
      for (const [name, identity] of snapshots) {
        if (!sameIdentity(identity, await lstat(name))) refuse(phase);
      }
      for (const [name, text] of texts) {
        if ((await readFile(name, "utf8")) !== text) refuse(phase);
      }
      await unstarted();
    };
    await recheck();
    signal?.throwIfAborted();
    phase = "receipt archival failed";
    // Reserve a unique destination without overwriting a previous archive.
    const archive = await mkdtemp(
      path.join(path.dirname(blockedPath), "ownership-blocked-recovered-"),
    );
    phase = "retained evidence changed during inspection";
    await recheck();
    signal?.throwIfAborted();
    phase = "receipt archival failed";
    await rename(blockedPath, path.join(archive, "ownership-blocked.json"));
    process.stderr.write(
      `Native fixture recovery: archived ${path.join(archive, "ownership-blocked.json")}; ` +
        "authorizing parent exited with no native bootstrap intent. Previous failure remains unresolved. " +
        "Recovery left the profile untouched; a late WMI supervisor may still clean it up.\n",
    );
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof RecoveryRefusal) throw error;
    throw nativeFixtureRecoveryRefusal(phase, blockedPath);
  }
}
