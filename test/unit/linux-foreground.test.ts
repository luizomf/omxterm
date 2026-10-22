import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import type { IPty } from "node-pty";
import { expect, it, vi } from "vitest";
import { prepareNodePtyRuntime } from "../../scripts/prepare-node-pty-runtime.mjs";
import { createLocalTerminalSession } from "../../src/main/local-terminal-session";

const require = createRequire(import.meta.url);
const runtimePath = path.join(
  path.dirname(require.resolve("node-pty")),
  "unixTerminal.js",
);
const runtimeRequire = createRequire(runtimePath);

// Execute the pinned public getter, substituting only the external native addon.
// An empty application getter alone would omit node-pty's spawn-name fallback.
function publicForeground(
  source: string,
  platform: string,
  nativeName: () => unknown,
) {
  const exports = {} as { UnixTerminal: { prototype: object } };
  runInNewContext(source, {
    exports,
    __dirname: path.dirname(runtimePath),
    process: { platform },
    require(id: string) {
      if (id === "./utils")
        return {
          loadNativeModule: () => ({
            module: { process: nativeName },
            dir: ".",
          }),
        };
      return runtimeRequire(id) as unknown;
    },
  });
  const getter = Object.getOwnPropertyDescriptor(
    exports.UnixTerminal.prototype,
    "process",
  )!.get!;
  return () =>
    getter.call({ _fd: 1, _pty: "/dev/pts/1", _file: "/bin/bash" }) as unknown;
}

function sessionFor(readForeground: () => unknown, platform: string) {
  const pty = {
    get process() {
      return readForeground();
    },
    onData: () => ({ dispose: vi.fn() }),
    onExit: () => ({ dispose: vi.fn() }),
    kill: vi.fn(),
  } as unknown as IPty;
  return createLocalTerminalSession(() => pty, {
    shell: "/bin/bash",
    platform,
    homeDirectory: "/synthetic-home",
    applicationVersionProvider: { getVersion: () => "foreground-test" },
    environment: {},
    onOutput: vi.fn(),
    onExit: vi.fn(),
  });
}

it("keeps unavailable Linux native foreground reads Busy through the pinned public getter", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-foreground-"));
  const isolatedRuntime = path.join(root, "unixTerminal.js");
  try {
    const installed = await readFile(runtimePath, "utf8");
    // Recover the reviewed pre-#484 input even after production postinstall.
    const previous = installed.replace(
      "            // OMXTerm keeps unavailable Linux foreground reads unavailable (ADR 0017).\n            return pty.process(this._fd, this._pty);",
      "            return pty.process(this._fd, this._pty) || this._file;",
    );
    const unavailable = () => undefined;
    const fallback = publicForeground(previous, "linux", unavailable);
    expect(fallback()).toBe("/bin/bash");
    expect(sessionFor(fallback, "linux").hasForegroundChildProcess()).toBe(
      false,
    );

    await writeFile(isolatedRuntime, previous);
    await prepareNodePtyRuntime({
      platform: "linux",
      arch: "x64",
      unixRuntimePath: isolatedRuntime,
      // The runtime correction is under test; never compile node-pty here.
      rebuild: async () => {},
    });
    const corrected = await readFile(isolatedRuntime, "utf8");
    expect(
      sessionFor(
        publicForeground(corrected, "linux", unavailable),
        "linux",
      ).hasForegroundChildProcess(),
    ).toBe(true);
    expect(
      sessionFor(
        publicForeground(corrected, "linux", () => "bash"),
        "linux",
      ).hasForegroundChildProcess(),
    ).toBe(false);
    expect(
      sessionFor(
        publicForeground(corrected, "linux", () => "sleep"),
        "linux",
      ).hasForegroundChildProcess(),
    ).toBe(true);
    // Darwin's native unavailable and kernel_task policies are unchanged.
    expect(
      sessionFor(
        publicForeground(corrected, "darwin", unavailable),
        "darwin",
      ).hasForegroundChildProcess(),
    ).toBe(true);
    expect(
      sessionFor(
        publicForeground(corrected, "darwin", () => "kernel_task"),
        "darwin",
      ).hasForegroundChildProcess(),
    ).toBe(false);

    await prepareNodePtyRuntime({
      platform: "linux",
      arch: "x64",
      unixRuntimePath: isolatedRuntime,
      // The runtime correction is under test; never compile node-pty here.
      rebuild: async () => {},
    });
    expect(await readFile(isolatedRuntime, "utf8")).toBe(corrected);
    await writeFile(isolatedRuntime, corrected + "\n// drift\n");
    await expect(
      prepareNodePtyRuntime({
        platform: "linux",
        arch: "x64",
        unixRuntimePath: isolatedRuntime,
        rebuild: async () => {},
      }),
    ).rejects.toThrow("Unrecognized node-pty Unix runtime");
    expect(await readFile(isolatedRuntime, "utf8")).toBe(
      corrected + "\n// drift\n",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
