import { afterEach, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inspector, until } from "../fixtures/packaged-inspector";

class ControlledSocket extends EventTarget {
  static current: ControlledSocket;
  sent: Array<{ id: number; method: string }> = [];
  constructor(_url: string) {
    super();
    ControlledSocket.current = this;
    queueMicrotask(() => this.dispatchEvent(new Event("open")));
  }
  send(text: string) {
    const message = JSON.parse(text) as { id: number; method: string };
    this.sent.push(message);
    if (message.method === "Runtime.runIfWaitingForDebugger")
      this.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            method: "Debugger.paused",
            params: { reason: "start" },
          }),
        }),
      );
    this.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({ id: message.id, result: {} }),
      }),
    );
  }
  close() {
    this.dispatchEvent(new Event("close"));
  }
}
afterEach(() => vi.unstubAllGlobals());

it("retains the initial debugger pause even when it arrives before the resume-command reply", async () => {
  vi.stubGlobal("WebSocket", ControlledSocket);
  const client = await inspector("ws://127.0.0.1:1234/abcd");
  try {
    await client.request("Runtime.runIfWaitingForDebugger");
    expect(await client.nextEvent("Debugger.paused", 100)).toEqual({
      reason: "start",
    });
  } finally {
    client.close();
  }
});

it("forwards worker notifications without consuming ordinary request replies", async () => {
  vi.stubGlobal("WebSocket", ControlledSocket);
  const events: Array<{ method: string; params: unknown }> = [];
  const client = await inspector("ws://127.0.0.1:1234/abcd", (method, params) =>
    events.push({ method, params }),
  );
  try {
    ControlledSocket.current.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({
          method: "NodeWorker.attachedToWorker",
          params: { sessionId: "1" },
        }),
      }),
    );
    expect(await client.request("Runtime.enable")).toEqual({});
    expect(events).toEqual([
      { method: "NodeWorker.attachedToWorker", params: { sessionId: "1" } },
    ]);
  } finally {
    client.close();
  }
});

it("rejects an outstanding pause wait when the inspector disconnects", async () => {
  vi.stubGlobal("WebSocket", ControlledSocket);
  const client = await inspector("ws://127.0.0.1:1234/abcd");
  const waiting = client.nextEvent("Debugger.paused", 1000);
  ControlledSocket.current.close();
  await expect(waiting).rejects.toThrow("Inspector closed");
});

it(
  "observes a real Node inspect-brk pause before its controlled entry executes",
  { timeout: 15000 },
  async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "inspector-start-"));
    const root = await realpath(temporary);
    const entry = path.join(root, "entry.cjs");
    await writeFile(entry, 'process.stdout.write("ENTRY_RAN\\n");\n');
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    delete env.NODE_INSPECT_RESUME_ON_START;
    const child = spawn(
      process.execPath,
      ["--inspect-brk=127.0.0.1:0", entry],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "",
      stdout = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    const exited = new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve) =>
      child.once("close", (code, signal) => resolve({ code, signal })),
    );
    let client: Awaited<ReturnType<typeof inspector>> | undefined;
    try {
      await until(
        () => /Debugger listening on ws:\/\/127\.0\.0\.1:/.test(stderr),
        "controlled Node inspector",
        5000,
      );
      const url =
        /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+)/.exec(
          stderr,
        )?.[1];
      expect(url).toBeDefined();
      client = await inspector(url!);
      await client.request("Debugger.enable", {}, 5000);
      await client.request(
        "Debugger.setBreakpointByUrl",
        { url: pathToFileURL(entry).href, lineNumber: 0 },
        5000,
      );
      await client.request("Runtime.runIfWaitingForDebugger", {}, 5000);
      const pause = (await client.nextEvent("Debugger.paused", 5000)) as {
        reason: string;
        callFrames: Array<{
          callFrameId: string;
          location: {
            scriptId: string;
            lineNumber: number;
            columnNumber: number;
          };
        }>;
      };
      const location = pause.callFrames[0]!.location;
      expect(["Break on start", "ambiguous", "other"]).toContain(pause.reason);
      expect(client.scriptUrl(location.scriptId)).toBe(
        pathToFileURL(entry).href,
      );
      const possible = (await client.request(
        "Debugger.getPossibleBreakpoints",
        {
          start: {
            scriptId: location.scriptId,
            lineNumber: 0,
            columnNumber: 0,
          },
          end: {
            scriptId: location.scriptId,
            lineNumber: location.lineNumber + 1,
            columnNumber: 0,
          },
        },
        5000,
      )) as {
        locations: Array<{
          scriptId: string;
          lineNumber: number;
          columnNumber: number;
        }>;
      };
      expect(possible.locations[0]).toMatchObject(location);
      expect(stdout).toBe("");
      const evaluated = (await client.request(
        "Debugger.evaluateOnCallFrame",
        {
          callFrameId: pause.callFrames[0]!.callFrameId,
          expression: "process.pid",
          returnByValue: true,
        },
        5000,
      )) as { result: { value: number } };
      expect(evaluated.result.value).toBe(child.pid);
      await client.request("Debugger.resume", {}, 5000);
      await until(() => stdout.includes("ENTRY_RAN"), "controlled entry", 5000);
      client.close();
      client = undefined;
      expect(await exited).toEqual({ code: 0, signal: null });
    } finally {
      client?.close();
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await exited;
      await rm(temporary, { recursive: true, force: true });
    }
  },
);
