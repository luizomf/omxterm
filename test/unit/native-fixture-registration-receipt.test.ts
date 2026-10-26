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
