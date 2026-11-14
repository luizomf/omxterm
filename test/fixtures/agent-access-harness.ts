// The agent API's grant, endpoint and real omxterm-ctl client, wired as the
// app wires them (ADR 0052), for tests that drive them from outside.
import { execFile, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { afterAll, afterEach, beforeAll, expect, vi } from "vitest";
import {
  startAgentAccess,
  type AgentAccess,
} from "../../src/main/agent-access";
import type {
  AgentSessionObserver,
  AgentSessionPort,
} from "../../src/main/terminal-ipc-types";
import {
  agentIpc,
  type AgentModesRequest,
  type AgentPressRequest,
  type AgentReadRequest,
} from "../../src/shared/agent-access";
import { createCommandMarks } from "../../src/main/command-marks";
import { createIpcHarness } from "./terminal-ipc-harness";

type Register = Parameters<AgentAccess["register"]>;
// The window's shortcuts, and main's answers about closes and window actions.
type HarnessShortcuts = Pick<
  Parameters<typeof startAgentAccess>[0],
  "shortcut" | "keybinds"
> & { closeNeedsUser?: Register[3]; native?: Register[4] };

// One omxterm-ctl run from a pane. With input, stdin carries it and then ends.
function runCtl(
  client: string,
  profile: string,
  args: string[],
  pane?: string,
  input?: string | Buffer,
) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      const child = execFile(
        process.execPath,
        [client, ...args],
        {
          env: {
            PATH: process.env.PATH,
            OMXTERM_PROFILE: profile,
            OMXTERM_PANE: pane,
          },
          encoding: "utf8",
        },
        (error, stdout, stderr) =>
          resolve({ code: Number(error?.code ?? 0), stdout, stderr }),
      );
      if (input !== undefined) child.stdin!.end(input);
    },
  );
}

/** Registers the harness's hooks; call it once at a test file's top level. */
export function useAgentHarness() {
  let client: string;
  const scratch = mkdtempSync(path.join(os.tmpdir(), "oa-"));
  beforeAll(async () => {
    // The real client, bundled the way the app ships it.
    client = path.join(scratch, "omxterm-ctl.cjs");
    await build({
      entryPoints: [
        path.resolve(import.meta.dirname, "../../src/agent-ctl/omxterm-ctl.ts"),
      ],
      bundle: true,
      platform: "node",
      format: "cjs",
      loader: { ".md": "text" },
      outfile: client,
      logLevel: "silent",
    });
  });
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  const cleanups: (() => void)[] = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const ctl = (
    profile: string,
    args: string[],
    pane?: string,
    input?: string | Buffer,
  ) => runCtl(client, profile, args, pane, input);

  // `omxterm-ctl mcp` over real stdio: send lines, await answers by id.
  function mcp(profile: string, pane?: string) {
    const child = spawn(process.execPath, [client, "mcp"], {
      env: {
        PATH: process.env.PATH,
        OMXTERM_PROFILE: profile,
        OMXTERM_PANE: pane,
      },
      stdio: ["pipe", "pipe", "inherit"],
    });
    cleanups.push(() => child.kill());
    const answers = new Map<
      unknown,
      (message: Record<string, unknown>) => void
    >();
    const lines: Record<string, unknown>[] = [];
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      for (let end; (end = buffer.indexOf("\n")) >= 0;) {
        const message = JSON.parse(buffer.slice(0, end)) as Record<
          string,
          unknown
        >;
        buffer = buffer.slice(end + 1);
        lines.push(message);
        answers.get(message.id)?.(message);
      }
    });
    let nextId = 0;
    const notify = (method: string, params?: object) =>
      child.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`,
      );
    const request = (method: string, params?: object) => {
      const id = nextId++;
      const answer = new Promise<Record<string, unknown>>((resolve) =>
        answers.set(id, resolve),
      );
      child.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
      );
      return answer;
    };
    const call = async (name: string, args: object = {}, meta?: object) => {
      const { result } = await request("tools/call", {
        name,
        arguments: args,
        ...(meta ? { _meta: meta } : {}),
      });
      const { content, isError } = result as {
        content: { type: string; text: string }[];
        isError: boolean;
      };
      expect(content).toHaveLength(1);
      return { text: content[0]!.text, isError };
    };
    const exited = new Promise<number | null>((resolve) =>
      child.on("exit", resolve),
    );
    return { child, request, notify, call, lines, exited };
  }

  // Two live panes. A write echoes back as output the window has consumed.
  function sessions(): AgentSessionPort & {
    writes: [string, string][];
    position: ReturnType<typeof vi.fn<AgentSessionPort["position"]>>;
    shell(id: string, exitCode?: number): void;
  } {
    const writes: [string, string][] = [];
    const shells = fakeShells();
    const sent = new Map([
      ["s1", 10],
      ["s2", 10],
    ]);
    const observers = new Set<AgentSessionObserver>();
    return {
      writes,
      sessions: () => [
        { sessionId: "s1", focused: true, cols: 80, rows: 24 },
        { sessionId: "s2", focused: false, cols: 80, rows: 24 },
      ],
      position: vi.fn((id: string) => {
        const position = sent.get(id);
        return position === undefined
          ? undefined
          : { sent: position, acknowledged: position };
      }),
      shell: shells.shell,
      reportsCommands: shells.marks.reports,
      commandEnd: shells.marks.endAfter,
      write(id, data) {
        writes.push([id, data]);
        setImmediate(() => {
          sent.set(id, shells.print(id, data, sent.get(id)!));
          for (const observer of observers) {
            observer.output(id);
            observer.acknowledged(id);
          }
        });
        return "accepted";
      },
      observe(observer) {
        observers.add(observer);
        return () => observers.delete(observer);
      },
    };
  }

  function setup(
    platform: NodeJS.Platform = process.platform,
    shortcuts: HarnessShortcuts = {},
  ) {
    const profile = mkdtempSync(path.join(scratch, "p"));
    const ipc = createIpcHarness();
    const contents = Object.assign(new EventEmitter(), {
      mainFrame: {},
      isDestroyed: () => false,
      send: vi.fn<(channel: string, payload: unknown) => void>(),
    });
    const window = Object.assign(new EventEmitter(), {
      webContents: contents,
      isDestroyed: () => false,
    });
    const event = { sender: contents, senderFrame: contents.mainFrame };
    const changed = vi.fn();
    const write = vi.fn();
    const access = startAgentAccess({
      ipc: ipc.ipcMain,
      trusted: (candidate) => candidate.sender === contents,
      profile,
      platform,
      operationalEvents: { write },
      changed,
      ...shortcuts,
    });
    cleanups.push(() => access.dispose());
    const port = sessions();
    access.register(
      window,
      1,
      port,
      shortcuts.closeNeedsUser,
      shortcuts.native,
    );
    const states = () =>
      contents.send.mock.calls
        .filter(([channel]) => channel === agentIpc.state)
        .map(([, state]) => state);
    // The window answers reads, presses and modes like the renderer would; a
    // press's bytes name its keys here, the Surface's encoder is tested apart.
    contents.send.mockImplementation((channel: string, payload: unknown) => {
      // Two tabs: s1 in the selected one, s2 in the other.
      if (channel === agentIpc.tabs) {
        const request = payload as { id: string };
        setImmediate(() =>
          ipc.listeners.get(agentIpc.tabsResult)!(event, {
            id: request.id,
            tabs: [
              { tab: "t1", title: "zsh", selected: true, panes: ["s1"] },
              { tab: "t2", title: "vim", selected: false, panes: ["s2"] },
            ],
          }),
        );
      }
      if (channel === agentIpc.press) {
        const request = payload as AgentPressRequest;
        setImmediate(() =>
          ipc.listeners.get(agentIpc.pressResult)!(event, {
            id: request.id,
            data: request.keys
              .map((key) => `<${key.ctrl ? "C-" : ""}${key.key}>`)
              .join(""),
          }),
        );
      }
      // s2's program took bracketed paste; s1's didn't.
      if (channel === agentIpc.modes) {
        const request = payload as AgentModesRequest;
        setImmediate(() =>
          ipc.listeners.get(agentIpc.modesResult)!(event, {
            id: request.id,
            bracketedPaste: request.sessionId === "s2",
          }),
        );
      }
      if (channel !== agentIpc.read) return;
      const request = payload as AgentReadRequest;
      setImmediate(() =>
        ipc.listeners.get(agentIpc.readResult)!(event, {
          id: request.id,
          text: `${request.source} of ${request.sessionId}`,
          truncated: false,
        }),
      );
    });
    const shown = async () => {
      ipc.listeners.get(agentIpc.shown)!(event);
      await vi.waitFor(() =>
        expect(states().at(-1)).toEqual({ state: "granted" }),
      );
    };
    const grants = () => {
      try {
        return readdirSync(path.join(profile, "agent-api", "grants"));
      } catch {
        return [];
      }
    };
    const pane = `${access.instance}:1:s1`;
    return {
      profile,
      pane,
      ipc,
      event,
      window,
      contents,
      access,
      port,
      states,
      shown,
      grants,
      changed,
      write,
    };
  }

  return { scratch, cleanups, ctl, mcp, sessions, setup };
}

// Panes whose shell reports commands (OSC 133): each Enter runs one, which
// ends with the pane's exit code, or never without one.
function fakeShells() {
  const codes = new Map<string, number | undefined>();
  return {
    marks: createCommandMarks(),
    shell: (id: string, exitCode?: number) => void codes.set(id, exitCode),
    /** The pane's output for what was written; answers its new position. */
    print(id: string, data: string, position: number) {
      const code = codes.get(id);
      const output =
        data !== "\r" || !codes.has(id)
          ? data
          : `\r\n\x1b]133;C\x07${code === undefined ? "" : `\x1b]133;D;${code}\x07\x1b]133;A\x07$ `}`;
      this.marks.observe(id as `s${number}`, output, position + output.length);
      return position + output.length;
    },
  };
}
