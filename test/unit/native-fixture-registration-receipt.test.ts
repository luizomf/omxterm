import { build } from "esbuild";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { beforeAll, expect, it, vi } from "vitest";
import { readOutcome } from "../fixtures/native-fixture-outcome";
import { FIXTURE_PROCESS_DIRECTORY } from "../fixtures/native-fixture-ownership";
import type { FixtureProcess } from "../fixtures/native-fixture-processes";

let ownershipProgram: string, supervisorProgram: string;
beforeAll(async () => {
  [ownershipProgram, supervisorProgram] = (await Promise.all(
    ["native-fixture-ownership", "native-fixture-supervisor"].map(
      async (name) => {
        const compiled = await build({
          entryPoints: [`test/fixtures/${name}.ts`],
          bundle: true,
          format: "cjs",
          platform: "node",
          write: false,
        });
        return compiled.outputFiles[0]!.text;
      },
    ),
  )) as [string, string];
});

it.each([
  ["normal", "completed-write", "close"],
  ["normal", "completed-replacement", "rename"],
  ["early-exit", "completed-write", "close"],
  ["early-exit", "completed-replacement", "rename"],
] as const)(
  "delivers %s %s metadata through the actual external-child supervisor receipt without settling pending ownership",
  async (branch, phase, syscall) => {
    // Only this test's fresh temporary filesystem is real. Native process I/O,
    // PTY creation and Windows inventories are substituted; no native probe runs.
    const base = fs.mkdtempSync(
      path.join(tmpdir(), "omxterm-registration-diagnostic-"),
    );
    const root = path.join(base, "profile");
    fs.mkdirSync(path.join(root, FIXTURE_PROCESS_DIRECTORY), {
      recursive: true,
    });
    const parent = { pid: 9990, parent: 1, identity: "50" };
    const owner = { pid: 10000, parent: parent.pid, identity: "100" };
    const children = [1, 2, 3, 4].map((offset) => ({
      pid: owner.pid + offset,
      parent: owner.pid,
      identity: String(100 + offset),
    }));
    const primary = Object.assign(
      new Error("private original message/path/argv"),
      { code: "EIO", errno: -5, syscall },
    );
    const require = createRequire(import.meta.url);
    let stderr = "";
    const module = { exports: {} };
    try {
      runInNewContext(ownershipProgram, {
        module,
        exports: module.exports,
        process: {
          pid: owner.pid,
          platform: "win32",
          env: { OMXTERM_NATIVE_FIXTURE_ROOT: root },
        },
        require: (name: string) => {
          if (name === "node:child_process")
            return {
              execFileSync: () => JSON.stringify([parent, owner, ...children]),
            };
          if (name === "node:fs")
            return {
              ...fs,
              writeSync: (fd: number, text: string) => {
                expect(fd).toBe(2);
                stderr += text;
                return Buffer.byteLength(text);
              },
              writeFileSync: (...args: Parameters<typeof fs.writeFileSync>) => {
                fs.writeFileSync(...args);
                if (
                  (JSON.parse(String(args[1])) as { processes?: unknown })
                    .processes &&
                  phase === "completed-write"
                )
                  throw primary;
              },
              renameSync: (from: fs.PathLike, to: fs.PathLike) => {
                if (
                  (
                    JSON.parse(fs.readFileSync(from, "utf8")) as {
                      processes?: unknown;
                    }
                  ).processes &&
                  phase === "completed-replacement"
                )
                  throw primary;
                fs.renameSync(from, to);
              },
            };
          return require(name) as unknown;
        },
      });
      const registration = module.exports as {
        spawnFixtureProcess: typeof import("../fixtures/native-fixture-ownership").spawnFixtureProcess;
      };
      let completed!: () => void, received: unknown;
      const spawn = vi.fn(() => ({
        pid: branch === "normal" ? children[0]!.pid : owner.pid + 100,
      }));
      try {
        registration.spawnFixtureProcess(spawn, (_child, callback) => {
          completed = callback;
        });
        if (branch === "early-exit") await Promise.resolve().then(completed);
      } catch (error) {
        received = error;
      }
      expect(spawn).toHaveBeenCalledOnce();
      expect(received).toBe(branch === "normal" ? primary : undefined);
      const registry = path.join(root, FIXTURE_PROCESS_DIRECTORY);
      const recordsBefore = fs
        .readdirSync(registry)
        .map((name) => [
          name,
          fs.readFileSync(path.join(registry, name), "utf8"),
        ]);
      expect(recordsBefore).toHaveLength(2);
      fs.writeFileSync(
        path.join(root, "native-process.json"),
        JSON.stringify(owner),
      );
      fs.writeFileSync(
        path.join(root, "native-exit.json"),
        JSON.stringify({ exitCode: 1, signal: null, reason: "exit" }),
      );
      fs.writeFileSync(path.join(root, "native-stdout"), "");
      fs.writeFileSync(path.join(root, "native-stderr"), stderr);
      const evidencePath = path.join(base, "receipt.json");
      const requestPath = path.join(root, "supervisor-request.json");
      fs.writeFileSync(
        requestPath,
        JSON.stringify({
          executable: "not-executed",
          args: [],
          root,
          timeout: 5000,
          evidencePath,
          parent,
          externalChild: true,
        }),
      );
      let finish!: () => void;
      const exited = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const supervisor = Object.assign(new EventEmitter(), {
        argv: ["node", "supervisor", requestPath],
        platform: "win32",
        connected: false,
        exit: vi.fn(() => {
          finish();
        }),
      });
      const forbiddenSpawn = vi.fn(() => {
        throw new Error("Native spawn forbidden");
      });
      runInNewContext(supervisorProgram, {
        process: supervisor,
        Buffer,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        require: (name: string) => {
          if (name === "node:child_process")
            return {
              spawn: forbiddenSpawn,
              // Inventories retain only the caller. Termination is a no-op model.
              execFileSync: () => JSON.stringify([parent]),
            };
          return require(name) as unknown;
        },
      });
      await exited;
      const result = await readOutcome(evidencePath);
      expect(result).toMatchObject({
        exitCode: 1,
        signal: null,
        reason: "exit",
        stdout: "",
        stderr,
        cleanupErrors: [
          "Error: Fixture process registration was interrupted; cleanup is uncertain",
        ],
      });
      const lines = result!.stderr.trimEnd().split("\n");
      expect(lines).toHaveLength(branch === "normal" ? 1 : 2);
      expect(lines[0]).toMatch(/^__OMXTERM_FIXTURE_REGISTRATION_FAILURE__/u);
      expect(
        JSON.parse(
          lines[0]!.slice("__OMXTERM_FIXTURE_REGISTRATION_FAILURE__".length),
        ),
      ).toEqual({ version: 1, branch, phase, code: "EIO", errno: -5, syscall });
      if (branch === "early-exit")
        expect(
          JSON.parse(
            lines[1]!.slice("__OMXTERM_FIXTURE_REGISTRATION_FAILURE__".length),
          ),
        ).toEqual({
          version: 1,
          branch,
          phase: "exit-observation",
          code: "EIO",
          errno: -5,
          syscall,
        });
      expect(result!.stderr).not.toContain("private");
      expect(forbiddenSpawn).not.toHaveBeenCalled();
      expect(supervisor.exit).toHaveBeenCalledWith(1);
      expect(fs.existsSync(root)).toBe(true);
      expect(
        fs
          .readdirSync(registry)
          .map((name) => [
            name,
            fs.readFileSync(path.join(registry, name), "utf8"),
          ]),
      ).toEqual(recordsBefore);
    } finally {
      // No real process was created; this is solely the test-owned model root.
      fs.rmSync(base, { recursive: true, force: true });
    }
  },
);

it.each([
  "settled",
  "survived",
  "reused",
  "inspection",
  "write",
  "rename",
  "nonzero",
  "timeout",
])(
  "hands failed-start ledger acquisition to independent emitted cleanup (%s)",
  async (mode) => {
    const base = fs.mkdtempSync(
      path.join(tmpdir(), "omxterm-failed-start-receipt-"),
    );
    const root = path.join(base, "profile");
    const registry = path.join(root, FIXTURE_PROCESS_DIRECTORY);
    fs.mkdirSync(registry, { recursive: true });
    const parent = { pid: 9990, parent: 1, identity: "50" };
    const owner = { pid: 10000, parent: parent.pid, identity: "100" };
    const child = { pid: 10001, parent: owner.pid, identity: "200" };
    const require = createRequire(import.meta.url);
    let producerRows = [parent, owner];
    let failedStart!: () => void;
    let observing = false;
    let stderr = "";
    const module = { exports: {} };
    try {
      runInNewContext(ownershipProgram, {
        module,
        exports: module.exports,
        process: {
          pid: owner.pid,
          platform: "win32",
          env: { OMXTERM_NATIVE_FIXTURE_ROOT: root },
        },
        require: (name: string) => {
          if (name === "node:child_process")
            return {
              execFileSync: () => {
                if (observing && mode === "inspection")
                  throw new Error("controlled inspection failure");
                return JSON.stringify(producerRows);
              },
            };
          if (name === "node:fs")
            return {
              ...fs,
              writeSync: (_fd: number, text: string) => {
                stderr += text;
                return text.length;
              },
              writeFileSync: (...args: Parameters<typeof fs.writeFileSync>) => {
                fs.writeFileSync(...args);
                if (observing && mode === "write")
                  throw new Error("controlled publication failure");
              },
              renameSync: (from: fs.PathLike, to: fs.PathLike) => {
                if (observing && mode === "rename")
                  throw new Error("controlled publication failure");
                fs.renameSync(from, to);
              },
            };
          return require(name) as unknown;
        },
      });
      (
        module.exports as typeof import("../fixtures/native-fixture-ownership")
      ).spawnFixtureProcess(
        () => ({ pid: 0 }),
        (_child, _exit, _ready, failed) => {
          failedStart = failed;
        },
      );
      fs.writeFileSync(
        path.join(root, "native-process.json"),
        JSON.stringify(owner),
      );
      fs.writeFileSync(path.join(root, "native-stdout"), "");
      fs.writeFileSync(path.join(root, "native-stderr"), "");
      const evidencePath = path.join(base, "receipt.json");
      const requestPath = path.join(root, "supervisor-request.json");
      fs.writeFileSync(
        requestPath,
        JSON.stringify({
          executable: "never-executed",
          args: [],
          root,
          timeout: 5000,
          evidencePath,
          parent,
          externalChild: true,
        }),
      );
      const pending = ["inspection", "write", "rename"].includes(mode);
      let live: FixtureProcess[] = [parent, owner];
      const inventories: FixtureProcess[][] = [];
      const requested: FixtureProcess[][] = [];
      const signaled: FixtureProcess[] = [];
      let inspect!: () => void;
      let clock = 0;
      class Clock extends Date {
        static override now() {
          return clock;
        }
      }
      let finish!: () => void;
      const exited = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const supervisor = Object.assign(new EventEmitter(), {
        argv: ["node", "supervisor", requestPath],
        platform: "win32",
        connected: false,
        exit: vi.fn(() => {
          finish();
        }),
      });
      const forbiddenSpawn = vi.fn(() => {
        throw new Error("Native spawn forbidden");
      });
      runInNewContext(supervisorProgram, {
        process: supervisor,
        Buffer,
        Date: Clock,
        setInterval: (callback: () => void) => {
          inspect = callback;
          return 1;
        },
        clearInterval: () => {},
        clearTimeout: () => {},
        setTimeout: (callback: () => void, delay: number) => {
          if (delay === 5000)
            queueMicrotask(() => {
              // The supervisor's first sample already missed the child and saw
              // only a pending write-ahead record. Acquire while owner is live,
              // then remove owner before any further supervisor inventory.
              expect(inventories).toEqual([[parent, owner]]);
              producerRows = [parent, owner, child];
              observing = true;
              failedStart();
              live = pending ? [parent] : [parent, { ...child, parent: 1 }];
              fs.writeFileSync(path.join(root, "native-stderr"), stderr);
              fs.writeFileSync(
                path.join(root, "native-exit.json"),
                JSON.stringify({
                  exitCode: mode === "nonzero" ? 7 : 0,
                  signal: null,
                  reason: "exit",
                }),
              );
              if (mode === "timeout") callback();
              else inspect();
            });
          else if (delay === 50)
            queueMicrotask(() => {
              clock += 5000;
              callback();
            });
          else expect(delay).toBe(1000); // Existing stream-close race, no real timer.
          return 2;
        },
        require: (name: string) => {
          if (name === "node:child_process")
            return {
              spawn: forbiddenSpawn,
              execFileSync: (file: string, args: string[], options: object) => {
                expect(file).toBe("powershell.exe");
                expect(options).toMatchObject({
                  timeout: 5000,
                  windowsHide: true,
                });
                const command = args[args.indexOf("-Command") + 1]!;
                if (command.startsWith("@(Get-CimInstance")) {
                  inventories.push([...live]);
                  return JSON.stringify(live);
                }
                // Execute no PowerShell. Decode the actual process helper's
                // literal targets and model its handle/birth-identity guard.
                expect(command).toContain("$null = $p.Handle");
                expect(command).toContain(
                  "$c.CreationDate.ToUniversalTime().Ticks.ToString() -eq $target.identity",
                );
                expect(command).toContain("$p.Kill()");
                const encoded = /FromBase64String\('([^']+)'\)/u.exec(
                  command,
                )![1]!;
                const targets = JSON.parse(
                  Buffer.from(encoded, "base64").toString(),
                ) as FixtureProcess[];
                requested.push(targets);
                if (mode === "reused")
                  live = [parent, { ...child, parent: 1, identity: "999" }];
                for (const target of targets) {
                  if (
                    !live.some(
                      (row) =>
                        row.pid === target.pid &&
                        row.identity === target.identity,
                    )
                  )
                    continue;
                  signaled.push(target);
                  if (mode !== "survived")
                    live = live.filter((row) => row.pid !== target.pid);
                }
                return "";
              },
            };
          return require(name) as unknown;
        },
      });
      await exited;
      const result = await readOutcome(evidencePath);
      expect(result).toMatchObject({
        exitCode: mode === "nonzero" ? 7 : 0,
        signal: null,
        reason: mode === "timeout" ? "timeout" : "exit",
        cleanupErrors: pending
          ? [
              "Error: Fixture process registration was interrupted; cleanup is uncertain",
            ]
          : mode === "survived"
            ? ["Error: Fixture processes survived cleanup: 10001"]
            : [],
        ownedProcesses: pending ? [owner] : [owner, child],
      });
      expect(forbiddenSpawn).not.toHaveBeenCalled();
      expect(requested).toEqual([pending ? [owner] : [child, owner]]);
      expect(signaled).toEqual(pending || mode === "reused" ? [] : [child]);
      // Cleanup must inspect again after its identity-specific command; merely
      // publishing the completed record is not the disappearance receipt.
      expect(inventories.length).toBeGreaterThanOrEqual(5);
      expect(inventories.at(-1)).toEqual(live);
      expect(live).toEqual(
        mode === "survived"
          ? [parent, { ...child, parent: 1 }]
          : mode === "reused"
            ? [parent, { ...child, parent: 1, identity: "999" }]
            : [parent],
      );
      expect(supervisor.exit).toHaveBeenCalledExactlyOnceWith(
        mode === "settled" || mode === "reused" ? 0 : 1,
      );
      expect(fs.existsSync(root)).toBe(pending || mode === "survived");
      if (pending)
        expect(
          JSON.parse(
            fs.readFileSync(
              path.join(
                registry,
                fs
                  .readdirSync(registry)
                  .find((name) => name.endsWith(".json"))!,
              ),
              "utf8",
            ),
          ),
        ).toEqual({ owner });
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  },
);
