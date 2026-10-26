import { copyFile, cp, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { EventEmitter } from "node:events";
import { runInNewContext } from "node:vm";
import type { IPty } from "node-pty";
import { vi } from "vitest";
import { prepareNodePtyRuntime } from "../../scripts/prepare-node-pty-runtime.mjs";

const require = createRequire(import.meta.url);
const installed = path.dirname(require.resolve("node-pty/package.json"));

export async function copyWindowsArtifacts(root: string, arch = "arm64") {
  await mkdir(path.join(root, "lib"), { recursive: true });
  await copyFile(
    path.join(installed, "lib/utils.js"),
    path.join(root, "lib/utils.js"),
  );
  await cp(
    path.join(installed, `prebuilds/win32-${arch}`),
    path.join(root, `prebuilds/win32-${arch}`),
    { recursive: true },
  );
}

// Execute the actual guarded Windows JS and event dispatch, never an addon,
// worker or native socket. Shared by preparation and ownership composition units.
export async function preparedWindows(root: string) {
  await copyWindowsArtifacts(root);
  const directory = path.join(installed, "lib");
  const sources = new Map<string, string>();
  for (const file of [
    "windowsPtyAgent.js",
    "windowsTerminal.js",
    "terminal.js",
    "eventEmitter2.js",
  ]) {
    const target = path.join(root, file);
    await copyFile(path.join(directory, file), target);
  }
  await prepareNodePtyRuntime({
    platform: "win32",
    arch: "arm64",
    nodePtyRoot: root,
    windowsRuntimePath: path.join(root, "windowsPtyAgent.js"),
    windowsTerminalPath: path.join(root, "windowsTerminal.js"),
    terminalRuntimePath: path.join(root, "terminal.js"),
  });
  for (const file of [
    "windowsPtyAgent",
    "windowsTerminal",
    "terminal",
    "eventEmitter2",
  ])
    sources.set(
      `./${file}`,
      await readFile(path.join(root, `${file}.js`), "utf8"),
    );
  const sockets: Socket[] = [];
  class Socket extends EventEmitter {
    readable = true;
    destroy = vi.fn();
    setEncoding() {}
    constructor() {
      super();
      sockets.push(this);
    }
  }
  const worker = {
    ready: () => {},
    error: (_error: Error) => {},
    dispose: vi.fn(),
  };
  let nativeExit = (_code: number) => {};
  const native = {
    startProcess: vi.fn(() => ({ fd: 1, pty: 2, conin: "in", conout: "out" })),
    connect: vi.fn((...args: unknown[]) => {
      nativeExit = args[5] as typeof nativeExit;
      return { pid: 1234 };
    }),
    kill: vi.fn(),
    resize: vi.fn(),
  };
  const modules = new Map<string, object>();
  const load = (id: string): unknown => {
    if (id === "./utils")
      return {
        assign: Object.assign,
        loadNativeModule: () => ({ module: native }),
      };
    if (id === "fs") return { openSync: () => 1 };
    if (id === "net") return { Socket };
    if (id === "./windowsConoutConnection")
      return {
        ConoutConnection: class {
          onReady(listener: () => void) {
            worker.ready = listener;
          }
          onError(listener: (error: Error) => void) {
            worker.error = listener;
          }
          connectSocket() {}
          dispose = worker.dispose;
        },
      };
    if (!sources.has(id)) return require(id) as unknown;
    if (!modules.has(id)) {
      const exports = {};
      modules.set(id, exports);
      runInNewContext(sources.get(id)!, {
        exports,
        require: load,
        setTimeout,
        clearTimeout,
        process,
      });
    }
    return modules.get(id);
  };
  const { WindowsTerminal } = load("./windowsTerminal") as {
    WindowsTerminal: new (
      file: string,
      args: string[],
      options: object,
    ) => IPty;
  };
  return {
    spawn: () => new WindowsTerminal("valid.exe", [], { useConptyDll: true }),
    native,
    worker,
    get output() {
      return sockets[0]!;
    },
    nativeExit: (code: number) => nativeExit(code),
  };
}
