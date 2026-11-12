import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

export async function until(
  check: () => Promise<boolean> | boolean,
  label: string,
  timeout = 20000,
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out: ${label}`);
}

// Disposable main-process observer only; never a replacement application entry.
export async function inspector(url: string) {
  assert.match(url, /^ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+$/);
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Inspector connection deadline"));
    }, 5000);
    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("Inspector connection failed"));
      },
      { once: true },
    );
  });
  let sequence = 0;
  const pending = new Map<
    number,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
    }
  >();
  let closed = false;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number;
      method?: string;
      params?: unknown;
      error?: unknown;
      result?: { exceptionDetails?: unknown; result?: { value?: unknown } };
    };
    if (message.id === undefined) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error || message.result?.exceptionDetails)
      request.reject(
        new Error(
          JSON.stringify(message.error ?? message.result?.exceptionDetails),
        ),
      );
    else request.resolve(message.result);
  });
  socket.addEventListener("close", () => {
    closed = true;
    for (const request of pending.values())
      request.reject(new Error("Inspector closed during request"));
    pending.clear();
  });
  const request = (method: string, params: object = {}, timeout = 90000) => {
    const id = ++sequence;
    return new Promise<unknown>((resolve, reject) => {
      if (closed) return reject(new Error("Inspector closed during request"));
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Inspector request deadline"));
      }, timeout);
      pending.set(id, {
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        },
      });
      try {
        socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        pending.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
  };
  return {
    async evaluate(expression: string, timeout = 90000) {
      const result = (await request(
        "Runtime.evaluate",
        {
          expression,
          awaitPromise: true,
          returnByValue: true,
        },
        timeout,
      )) as { result?: { value?: unknown } };
      return result?.result?.value;
    },
    close() {
      socket.close();
    },
  };
}

const execute = promisify(execFile);

async function executable(
  root: string,
  target: string,
): Promise<[string, ...string[]]> {
  // A built checkout runs on its own Electron, like `npm run dev`.
  if ((await stat(target)).isDirectory() && !target.endsWith(".app"))
    return [
      (await import("electron")).default as unknown as string,
      path.resolve(target),
    ];
  if (target.endsWith(".AppImage")) {
    // Extracting avoids a FUSE dependency; the bytes are unchanged.
    await execute(path.resolve(target), ["--appimage-extract"], {
      cwd: root,
      timeout: 120000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return [path.join(root, "squashfs-root/omxterm")];
  }
  if (target.endsWith(".app")) {
    const [name] = await readdir(path.join(target, "Contents/MacOS"));
    return [path.join(target, "Contents/MacOS", name!)];
  }
  return [target];
}

/**
 * Launches a packaged OMXTerm (.AppImage, .app bundle or executable), or a
 * built checkout directory, with
 * `root/home` as HOME and a private profile, then loads the smoke observer
 * into its main process. `call` evaluates `observer.<expression>`. The first
 * tab runs `/bin/sh` unless `defaultShell` asks for the Default Shell; launch
 * waits for `windows` windows (more when OMXTerm reopens remembered ones).
 */
export async function launchPackaged(
  app: string,
  root: string,
  env: NodeJS.ProcessEnv = {},
  { defaultShell = false, windows = 1 } = {},
) {
  const home = path.join(root, "home");
  await mkdir(path.join(home, ".config/omxterm"), { recursive: true });
  await writeFile(
    path.join(home, ".config/omxterm/config.json"),
    JSON.stringify({ version: 1, language: "en-US", confirmClose: false }),
  );
  const [command, ...prefix] = await executable(root, app);
  const child = spawn(
    command,
    [
      ...prefix,
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
      "--inspect=127.0.0.1:0",
      `--user-data-dir=${path.join(root, "profile")}`,
      ...(defaultShell ? [] : ["-e", "/bin/sh"]),
    ],
    {
      env: {
        ...process.env,
        HOME: home,
        ...(process.platform === "win32" ? { USERPROFILE: home } : {}),
        XDG_CONFIG_HOME: path.join(home, ".config"),
        ELECTRON_RUN_AS_NODE: undefined,
        ...env,
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (data: string) => {
    stderr += data;
  });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  let client: Awaited<ReturnType<typeof inspector>> | undefined;
  const stop = async () => {
    client?.close();
    client = undefined;
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await exited;
  };
  const observerFile = path.resolve(
    "test/fixtures/packaged-smoke-observer.cjs",
  );
  const observer = `process.getBuiltinModule('module').createRequire(${JSON.stringify(observerFile)})(${JSON.stringify(observerFile)})`;
  const call = (expression: string, timeout = 5000) =>
    client!.evaluate(`${observer}.${expression}`, timeout);
  try {
    await until(
      () => /Debugger listening on ws:\/\/127\.0\.0\.1:/.test(stderr),
      "main inspector",
      60000,
    );
    client = await inspector(
      /Debugger listening on (ws:\/\/\S+)/.exec(stderr)![1]!,
    );
    // On Windows, loading the observer while a reused profile is still
    // starting can leave that inspector request unanswered.
    if (process.platform === "win32")
      await new Promise((resolve) => setTimeout(resolve, 3000));
    let last: unknown;
    await until(
      async () =>
        (last = await call("windows()").catch(
          (error: Error) => error.message,
        )) === windows,
      "application window",
      60000,
    ).catch((error: Error) => {
      throw new Error(`${error.message} (last: ${String(last)})`);
    });
  } catch (error) {
    await stop();
    // The app's own diagnostics, for a launch that never reached a window.
    throw new Error(`${(error as Error).message}\n${stderr.slice(-4000)}`);
  }
  return {
    home,
    call,
    stop,
    /** Quits through the application and waits for a normal exit. */
    async quit() {
      await call("quit()");
      // Node waits for an attached debugger before the process can exit.
      client!.close();
      client = undefined;
      await Promise.race([
        exited,
        new Promise((_, reject) =>
          // Extension cleanup alone may take 15 s, plus the PTY drain.
          setTimeout(() => reject(new Error("normal Quit")), 30000),
        ),
      ]);
    },
  };
}
