import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prepareNodePtyExecStatus } from "../../scripts/prepare-node-pty-exec-status.mjs";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import {
  copyWindowsArtifacts,
  preparedWindows,
} from "../fixtures/prepared-windows-pty";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareNodePtyRuntime } from "../../scripts/prepare-node-pty-runtime.mjs";

// Target-platform preparation tests must never invoke a host tool.
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(() => {
    throw new Error("Unexpected external preparation command");
  }),
}));

const require = createRequire(import.meta.url);
const installedUnixRuntime = path.join(
  path.dirname(require.resolve("node-pty")),
  "unixTerminal.js",
);

const nativePatch = fileURLToPath(
  new URL("../../native/node-pty-exec-status.patch", import.meta.url),
);

// Only this checked-in two-file unified patch, with exact positions/context.
// This substitutes the external tool, not preparation's independent digests.
function applyExecStatusPatch(cwd: string): void {
  const sections = readFileSync(nativePatch, "utf8").split(/(?=^--- a\/)/mu);
  expect(sections).toHaveLength(2);
  for (const [index, file] of ["pty.cc", "spawn-helper.cc"].entries()) {
    const section = sections[index]!;
    expect(section.endsWith("\n")).toBe(true);
    const lines = section.slice(0, -1).split("\n");
    expect(lines.shift()).toBe(`--- a/${file}`);
    expect(lines.shift()).toBe(`+++ b/${file}`);
    const source = readFileSync(path.join(cwd, file), "utf8").split("\n");
    const result: string[] = [];
    let cursor = 0;
    while (lines.length) {
      const header = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@$/u.exec(lines.shift()!);
      expect(
        header,
        "Only reviewed explicit unified hunks are supported",
      ).not.toBeNull();
      const start = Number(header![1]) - 1;
      const old: string[] = [],
        replacement: string[] = [];
      while (lines.length && !lines[0]!.startsWith("@@")) {
        const line = lines.shift()!;
        expect([" ", "+", "-"]).toContain(line[0]);
        if (line[0] !== "+") old.push(line.slice(1));
        if (line[0] !== "-") replacement.push(line.slice(1));
      }
      expect(old).toHaveLength(Number(header![2]));
      expect(replacement).toHaveLength(Number(header![4]));
      expect(start).toBeGreaterThanOrEqual(cursor);
      expect(source.slice(start, start + old.length)).toEqual(old);
      expect(result.length + start - cursor).toBe(Number(header![3]) - 1);
      result.push(...source.slice(cursor, start), ...replacement);
      cursor = start + old.length;
    }
    result.push(...source.slice(cursor));
    writeFileSync(path.join(cwd, file), result.join("\n"));
  }
}

let root: string;
let unixRuntimePath: string;
beforeEach(async () => {
  vi.mocked(execFileSync).mockClear();
  root = await mkdtemp(path.join(tmpdir(), "omxterm-node-pty-preparation-"));
  unixRuntimePath = path.join(root, "unixTerminal.js");
  await copyFile(installedUnixRuntime, unixRuntimePath);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("node-pty postinstall preparation", () => {
  it("builds node-pty with exec status on Linux ARM64", async () => {
    const rebuild = vi.fn().mockResolvedValue(undefined);
    const chmod = vi.fn().mockResolvedValue(undefined);

    await expect(
      prepareNodePtyRuntime({
        platform: "linux",
        arch: "arm64",
        unixRuntimePath,
        rebuild,
        chmod,
      }),
    ).resolves.toBe("corrected-and-rebuilt");
    expect(rebuild).toHaveBeenCalledOnce();
    expect(chmod).not.toHaveBeenCalled();
  });

  it("builds the Darwin ARM64 exec-status runtime and makes its helper executable", async () => {
    const rebuild = vi.fn().mockResolvedValue(undefined);
    const chmod = vi.fn().mockResolvedValue(undefined);

    await expect(
      prepareNodePtyRuntime({
        platform: "darwin",
        arch: "arm64",
        helperPath: "/node-pty/spawn-helper",
        unixRuntimePath,
        rebuild,
        chmod,
      }),
    ).resolves.toBe("corrected-and-rebuilt");
    expect(chmod).toHaveBeenCalledOnce();
    expect(chmod).toHaveBeenCalledWith("/node-pty/spawn-helper", 0o755);
    expect(rebuild).toHaveBeenCalledOnce();
  });

  it("rejects unreviewed node-pty Unix runtime bytes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-node-pty-drift-"));
    try {
      const runtimePath = path.join(root, "unixTerminal.js");
      const terminalRuntimePath = path.join(root, "terminal.js");
      await copyFile(installedUnixRuntime, runtimePath);
      await copyFile(
        path.join(path.dirname(installedUnixRuntime), "terminal.js"),
        terminalRuntimePath,
      );
      const options = {
        platform: "darwin",
        arch: "x64",
        unixRuntimePath: runtimePath,
        terminalRuntimePath,
        rebuild: vi.fn(),
        chmod: vi.fn(),
      };
      // Windows installs leave Unix source upstream; prepare only these copies
      // before removing one forwarding change to create a genuine partial patch.
      await expect(prepareNodePtyRuntime(options)).resolves.toBe("corrected");
      const prepared = await readFile(runtimePath, "utf8");
      const partial = prepared.replace(
        "var onexit = function (code, signal, execFailed)",
        "var onexit = function (code, signal)",
      );
      expect(partial).not.toBe(prepared);
      for (const unknown of ["unreviewed runtime\n", partial]) {
        await writeFile(runtimePath, unknown);
        await expect(prepareNodePtyRuntime(options)).rejects.toThrow(
          "Unrecognized node-pty Unix runtime",
        );
        expect(await readFile(runtimePath, "utf8")).toBe(unknown);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(["arm64", "x64"])(
    "prepares reviewed Windows %s bytes idempotently and refuses dependency drift",
    async (arch) => {
      const root = await mkdtemp(
        path.join(tmpdir(), "omxterm-node-pty-windows-"),
      );
      const runtimePath = path.join(root, "windowsPtyAgent.js");
      const rebuild = vi.fn().mockResolvedValue(undefined);
      const chmod = vi.fn().mockResolvedValue(undefined);
      const options = {
        platform: "win32",
        arch,
        nodePtyRoot: root,
        windowsRuntimePath: runtimePath,
        windowsTerminalPath: path.join(root, "windowsTerminal.js"),
        terminalRuntimePath: path.join(root, "terminal.js"),
        rebuild,
        chmod,
        // Windows must not touch the separate Unix runtime.
        unixRuntimePath: path.join(root, "absent-unix.js"),
      };
      try {
        await copyFile(
          path.join(
            path.dirname(require.resolve("node-pty")),
            "windowsPtyAgent.js",
          ),
          runtimePath,
        );
        await copyWindowsArtifacts(root, arch);
        for (const file of ["windowsTerminal.js", "terminal.js"])
          await copyFile(
            path.join(path.dirname(installedUnixRuntime), file),
            path.join(root, file),
          );
        await expect(prepareNodePtyRuntime(options)).resolves.toBe("corrected");
        const corrected = await readFile(runtimePath);
        expect(createHash("sha256").update(corrected).digest("hex")).toBe(
          "6042a70008684243efbc865d2615c22a16a910c7a65475bc1a33e49447bcd815",
        );
        // Upstream postinstall may create DLL-only build directories. They do
        // not shadow the official addon selected from prebuilds.
        await mkdir(path.join(root, "build/Release/conpty"), {
          recursive: true,
        });
        await writeFile(
          path.join(root, "build/Release/conpty/conpty.dll"),
          "unused build input",
        );
        await prepareNodePtyRuntime(options);
        expect(await readFile(runtimePath)).toEqual(corrected);
        const drifted = Buffer.concat([corrected, Buffer.from("\n// drift\n")]);
        await writeFile(runtimePath, drifted);
        await expect(prepareNodePtyRuntime(options)).rejects.toThrow(
          "Unrecognized node-pty Windows runtime",
        );
        expect(await readFile(runtimePath)).toEqual(drifted);
        for (const [file, expected] of [
          [
            "windowsTerminal.js",
            "4ceeb76ee0c99ec013678828a3fdf309a612c4613190e5ce16840f5096f7e162",
          ],
          [
            "terminal.js",
            "61698286a777b0c76826e138a9d07424e10db77a28b91ca62a9f96f06f76ff3c",
          ],
        ]) {
          const prepared = await readFile(path.join(root, file!));
          expect(createHash("sha256").update(prepared).digest("hex")).toBe(
            expected,
          );
          await writeFile(runtimePath, corrected);
          await writeFile(
            path.join(root, file!),
            Buffer.concat([prepared, Buffer.from("\n// drift\n")]),
          );
          await expect(prepareNodePtyRuntime(options)).rejects.toThrow(
            "Unrecognized node-pty terminal runtime",
          );
          await writeFile(path.join(root, file!), prepared);
        }
        expect(rebuild).not.toHaveBeenCalled();
        expect(chmod).not.toHaveBeenCalled();
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});

describe("node-pty prepared artifact and callback ordering", () => {
  it.each(["arm64", "x64"])(
    "installs the same patched Linux %s addon in the preferred and fallback locations",
    async (arch) => {
      const isolated = path.join(root, "node-pty");
      const installed = path.dirname(require.resolve("node-pty/package.json"));
      await cp(
        path.join(installed, "src/unix"),
        path.join(isolated, "src/unix"),
        { recursive: true },
      );
      const headerPackage = createRequire(
        path.join(installed, "package.json"),
      ).resolve("node-addon-api/package.json");
      await mkdir(path.join(isolated, "node_modules/node-addon-api"), {
        recursive: true,
      });
      await copyFile(
        headerPackage,
        path.join(isolated, "node_modules/node-addon-api/package.json"),
      );
      for (const location of ["build/Release", `prebuilds/linux-${arch}`]) {
        await mkdir(path.join(isolated, location), { recursive: true });
        await writeFile(
          path.join(isolated, location, "pty.node"),
          "stale addon",
        );
      }
      let buildRoot: string;
      const execute = vi.fn(
        (file: string, args: readonly string[], options: object) => {
          if (file === "patch") {
            buildRoot = (options as { cwd: string }).cwd;
            expect(options).toEqual({
              cwd: buildRoot,
              stdio: "pipe",
              timeout: 10_000,
            });
            expect(path.dirname(buildRoot)).toBe(tmpdir());
            expect(path.basename(buildRoot)).toMatch(/^omxterm-pty-build-/u);
            expect(buildRoot).not.toBe(isolated);
            expect(args).toEqual([
              "--batch",
              "--fuzz=0",
              "-p1",
              "-i",
              nativePatch,
            ]);
            applyExecStatusPatch(buildRoot);
            return Buffer.alloc(0);
          }
          expect(file).toBe("c++");
          const { include_dir } = require("node-api-headers") as {
            include_dir: string;
          };
          expect(args).toEqual([
            "-std=c++17",
            "-O2",
            "-DNAPI_VERSION=8",
            "-DNODE_GYP_MODULE_NAME=pty",
            "-DNAPI_CPP_EXCEPTIONS",
            `-I${include_dir}`,
            `-I${path.dirname(createRequire(path.join(isolated, "package.json")).resolve("node-addon-api/package.json"))}`,
            "-fPIC",
            "-pthread",
            "-shared",
            path.join(buildRoot!, "pty.cc"),
            "-lutil",
            "-o",
            path.join(buildRoot!, "pty.node"),
          ]);
          expect(options).toEqual({ stdio: "pipe", timeout: 60_000 });
          writeFileSync(
            path.join(buildRoot!, "pty.node"),
            "controlled compiler output",
          );
          return Buffer.alloc(0);
        },
      );
      await prepareNodePtyExecStatus({
        platform: "linux",
        arch,
        nodePtyRoot: isolated,
        execute: execute as unknown as typeof execFileSync,
      });
      for (const location of ["build/Release", `prebuilds/linux-${arch}`])
        expect(
          await readFile(path.join(isolated, location, "pty.node"), "utf8"),
        ).toBe("controlled compiler output");
      for (const file of ["pty.cc", "spawn-helper.cc"])
        expect(await readFile(path.join(isolated, "src/unix", file))).toEqual(
          await readFile(path.join(installed, "src/unix", file)),
        );
      expect(execFileSync).not.toHaveBeenCalled();
      await writeFile(path.join(isolated, "src/unix/pty.cc"), "unknown source");
      await expect(
        prepareNodePtyExecStatus({
          platform: "linux",
          arch,
          nodePtyRoot: isolated,
          execute: execute as unknown as typeof execFileSync,
        }),
      ).rejects.toThrow("Unrecognized node-pty native exec source");
      expect(execute).toHaveBeenCalledTimes(2);
    },
  );

  it("rejects wrong patched bytes before compilation or artifact replacement", async () => {
    const isolated = path.join(root, "node-pty");
    const installed = path.dirname(require.resolve("node-pty/package.json"));
    await cp(
      path.join(installed, "src/unix"),
      path.join(isolated, "src/unix"),
      { recursive: true },
    );
    const destinations = ["build/Release", "prebuilds/linux-arm64"];
    for (const location of destinations) {
      await mkdir(path.join(isolated, location), { recursive: true });
      await writeFile(
        path.join(isolated, location, "pty.node"),
        "retained addon",
      );
    }
    const execute = vi.fn(
      (file: string, args: readonly string[], options: { cwd: string }) => {
        expect(file).toBe("patch");
        expect(args).toEqual(["--batch", "--fuzz=0", "-p1", "-i", nativePatch]);
        writeFileSync(
          path.join(options.cwd, "pty.cc"),
          "wrong patched bytes\n",
        );
        return Buffer.alloc(0);
      },
    );
    await expect(
      prepareNodePtyExecStatus({
        platform: "linux",
        arch: "arm64",
        nodePtyRoot: isolated,
        execute: execute as unknown as typeof execFileSync,
      }),
    ).rejects.toThrow("node-pty native patch did not produce reviewed bytes");
    expect(execute).toHaveBeenCalledOnce();
    expect(execFileSync).not.toHaveBeenCalled();
    for (const location of destinations)
      expect(
        await readFile(path.join(isolated, location, "pty.node"), "utf8"),
      ).toBe("retained addon");
    for (const file of ["pty.cc", "spawn-helper.cc"])
      expect(await readFile(path.join(isolated, "src/unix", file))).toEqual(
        await readFile(path.join(installed, "src/unix", file)),
      );
  });

  it("refuses shadowing Windows builds and nonofficial native bytes", async () => {
    const isolated = path.join(root, "node-pty");
    const installed = path.dirname(require.resolve("node-pty/package.json"));
    await mkdir(path.join(isolated, "lib"), { recursive: true });
    await copyFile(
      path.join(installed, "lib/utils.js"),
      path.join(isolated, "lib/utils.js"),
    );
    await cp(
      path.join(installed, "prebuilds/win32-arm64"),
      path.join(isolated, "prebuilds/win32-arm64"),
      { recursive: true },
    );
    const options = { platform: "win32", arch: "arm64", nodePtyRoot: isolated };
    for (const directory of ["Release", "Debug"]) {
      const shadow = path.join(isolated, "build", directory);
      await mkdir(shadow, { recursive: true });
      await writeFile(path.join(shadow, "conpty.node"), "local build");
      await expect(prepareNodePtyRuntime(options)).rejects.toThrow(
        "Refusing shadowing",
      );
      await rm(shadow, { recursive: true });
    }
    await writeFile(
      path.join(isolated, "prebuilds/win32-arm64/conpty.node"),
      "different native bytes",
    );
    await expect(prepareNodePtyRuntime(options)).rejects.toThrow(
      "Unrecognized official",
    );
  });

  it.each(["connect", "timeout", "worker"])(
    "forwards deferred Windows %s failure explicitly and ignores late readiness",
    async (failure) => {
      vi.useFakeTimers();
      try {
        const fixture = await preparedWindows(root);
        const terminal = fixture.spawn();
        const exits: unknown[] = [];
        terminal.onExit((event) => exits.push(event));
        expect(terminal.pid).toBe(0);
        terminal.resize(100, 30);
        if (failure === "connect") {
          fixture.native.connect.mockImplementationOnce(() => {
            throw new Error("error code: 1");
          });
          fixture.worker.ready();
        } else if (failure === "worker")
          fixture.worker.error(new Error("worker unavailable"));
        else vi.advanceTimersByTime(5000);
        expect(exits).toEqual([
          {
            exitCode: failure === "connect" ? 1 : -1,
            signal: undefined,
            execFailed: true,
          },
        ]);
        expect(fixture.native.kill).toHaveBeenCalledOnce();
        expect(fixture.worker.dispose).toHaveBeenCalledOnce();
        const connected = fixture.native.connect.mock.calls.length;
        fixture.worker.ready();
        vi.advanceTimersByTime(5000);
        expect(fixture.native.connect).toHaveBeenCalledTimes(connected);
        expect(exits).toHaveLength(1);
        expect(fixture.native.resize).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("keeps Windows PID readiness, deferred control and ordinary numeric exits distinct", async () => {
    const fixture = await preparedWindows(root);
    const terminal = fixture.spawn();
    const exits: unknown[] = [];
    terminal.onExit((event) => exits.push(event));
    terminal.resize(100, 30);
    terminal.kill();
    expect(terminal.pid).toBe(0);
    fixture.worker.ready();
    fixture.output.emit("connect");
    expect(terminal.pid).toBe(1234);
    expect(fixture.native.resize).not.toHaveBeenCalled();
    expect(fixture.native.kill).not.toHaveBeenCalled();
    expect(exits).toEqual([]);
    fixture.output.emit("data", "first payload");
    expect(fixture.native.resize).toHaveBeenCalledOnce();
    expect(fixture.native.kill).toHaveBeenCalledOnce();
    expect(exits).toEqual([]);
    fixture.nativeExit(1);
    fixture.output.emit("close");
    expect(exits).toEqual([{ exitCode: 1, signal: undefined }]);
  });

  it("rebuilds the Linux x64 runtime with exec status", async () => {
    const rebuild = vi.fn().mockResolvedValue(undefined);
    const chmod = vi.fn().mockResolvedValue(undefined);

    await expect(
      prepareNodePtyRuntime({
        platform: "linux",
        arch: "x64",
        unixRuntimePath,
        rebuild,
        chmod,
      }),
    ).resolves.toBe("corrected-and-rebuilt");
    expect(rebuild).toHaveBeenCalledOnce();
    expect(chmod).not.toHaveBeenCalled();
  });
});
