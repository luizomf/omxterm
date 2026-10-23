// @vitest-environment jsdom
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerTerminalIpcRouter,
  type TrustedWebContents,
} from "../../src/main/terminal-ipc-controller";
import type { LocalTerminalSession } from "../../src/main/local-terminal-session";
import type { TerminalSessionLaunch } from "../../src/main/terminal-ipc-types";
import type { PersistedWorkspaceWindow } from "../../src/main/terminal-ipc-workspace";
import { createWorkspaceService } from "../../src/main/workspace-service";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  isWorkspacePlan,
  isWorkspaceSnapshot,
  type WorkspacePlan,
  type WorkspaceSnapshot,
} from "../../src/shared/workspace";
import {
  clipboardOptions,
  createIpcHarness,
} from "../fixtures/terminal-ipc-harness";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";

const twoPanes = {
  direction: "row" as const,
  children: [{ pane: 0 }, { pane: 1 }],
  weights: [0.3, 0.7],
};

describe("workspace contract", () => {
  it("accepts layouts whose leaves are exactly the panes", () => {
    const tab = {
      layout: twoPanes,
      focused: 1,
      panes: [
        { sessionId: "s1" },
        { sessionId: null, launch: { kind: "quick-ssh", target: "u@h" } },
      ],
    };
    expect(isWorkspaceSnapshot({ selected: 0, tabs: [tab] })).toBe(true);
    expect(isWorkspaceSnapshot({ selected: 0, tabs: [] })).toBe(true);
    expect(
      isWorkspaceSnapshot({
        selected: 0,
        tabs: [{ ...tab, panes: [{ sessionId: "s1" }] }],
      }),
    ).toBe(false);
    expect(
      isWorkspaceSnapshot({
        selected: 0,
        tabs: [
          {
            ...tab,
            panes: [
              { sessionId: "s1" },
              { sessionId: "s2", launch: { kind: "shell", path: "/" } },
            ],
          },
        ],
      }),
    ).toBe(false);
    expect(
      isWorkspacePlan({
        selected: 0,
        tabs: [{ layout: { pane: 0 }, focused: 0, panes: [{ kind: "shell" }] }],
      }),
    ).toBe(true);
    expect(
      isWorkspacePlan({
        selected: 0,
        tabs: [
          {
            layout: { pane: 0 },
            focused: 0,
            panes: [{ kind: "shell", token: "/etc" }],
          },
        ],
      }),
    ).toBe(false);
  });
});

function controllerHarness(directories: Record<string, string> = {}) {
  const ipc = createIpcHarness();
  const router = registerTerminalIpcRouter(ipc.ipcMain);
  const frame = {};
  const webContents: TrustedWebContents = {
    mainFrame: frame,
    isDestroyed: () => false,
    send: vi.fn(),
  };
  const launches: TerminalSessionLaunch[] = [];
  const saved: PersistedWorkspaceWindow[] = [];
  const plan: WorkspacePlan = {
    selected: 0,
    tabs: [{ layout: { pane: 0 }, focused: 0, panes: [{ kind: "shell" }] }],
  };
  const controller = router.registerController({
    ...clipboardOptions(),
    webContents,
    localHostNames: ["laptop"],
    onSessionStartError: vi.fn(),
    onSessionExit: vi.fn(),
    onWorkspace: (window) => saved.push(window),
    workspacePlan: vi.fn().mockReturnValueOnce(plan).mockReturnValue(null),
    resolveRestoredDirectory: (token) => directories[token],
    createSession(_callbacks, launch) {
      const index = launches.length;
      launches.push(launch);
      return {
        write: vi.fn(),
        resize: vi.fn(),
        close: vi.fn(),
        hasForegroundChildProcess: () => false,
        workingDirectory: () => `/native/${index + 1}`,
      } satisfies LocalTerminalSession;
    },
  });
  const owner = { sender: webContents, senderFrame: frame };
  return {
    controller,
    launches,
    saved,
    plan,
    start: (launch?: unknown) =>
      ipc.handlers.get(terminalIpc.start)!(owner, undefined, launch) as string,
    send: (channel: string, payload: unknown) =>
      ipc.listeners.get(channel)!(owner, payload),
    invoke: (channel: string) => ipc.handlers.get(channel)!(owner, undefined),
  };
}

describe("workspace reports in main", () => {
  it("saves shells by directory and connections by launch, again on close", () => {
    const harness = controllerHarness();
    harness.start();
    harness.start({ kind: "quick-ssh", target: "admin@host" });
    harness.send(terminalIpc.workingDirectory, {
      sessionId: "s1",
      uri: "file://laptop/home/me/project",
    });
    const snapshot: WorkspaceSnapshot = {
      selected: 0,
      tabs: [
        {
          layout: twoPanes,
          focused: 1,
          panes: [
            { sessionId: "s1" },
            {
              sessionId: "s2",
              launch: { kind: "quick-ssh", target: "admin@host" },
            },
          ],
        },
      ],
    };
    harness.send(terminalIpc.workspace, snapshot);
    expect(harness.saved.at(-1)).toEqual({
      selected: 0,
      tabs: [
        {
          layout: twoPanes,
          focused: 1,
          panes: [
            { kind: "shell", directory: "/home/me/project" },
            { kind: "quick-ssh", target: "admin@host" },
          ],
        },
      ],
    });
    harness.send(terminalIpc.workspace, { selected: 0, tabs: [{}] });
    expect(harness.saved).toHaveLength(1);
    harness.controller.dispose();
    expect(harness.saved).toHaveLength(2);
  });

  it("hands out the plan once and resolves restore tokens to directories", () => {
    const harness = controllerHarness({ r0123456789abcdef: "/home/me/src" });
    expect(harness.invoke(terminalIpc.workspacePlan)).toEqual(harness.plan);
    expect(harness.invoke(terminalIpc.workspacePlan)).toBeNull();
    harness.start({ kind: "restored", token: "r0123456789abcdef" });
    harness.start({ kind: "restored", token: "rffffffffffffffff" });
    expect(harness.launches).toEqual([
      { kind: "inherit", workingDirectory: "/home/me/src" },
      { kind: "inherit" },
    ]);
    expect(() => harness.start({ kind: "restored", token: "/etc" })).toThrow();
  });
});

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("workspace service", () => {
  async function service(options: { quitting?: () => boolean } = {}) {
    const directory =
      roots[0] ?? (await mkdtemp(path.join(tmpdir(), "omxterm-workspace-")));
    if (!roots.includes(directory)) roots.push(directory);
    const created = createWorkspaceService({
      directory,
      isDirectory: (candidate) => candidate.startsWith(directory),
      savedSession: (id) =>
        id === "work" ? { name: "Work", color: "#336699" } : undefined,
      isQuickTarget: (target) => !target.startsWith("-"),
      isQuitting: options.quitting ?? (() => false),
    });
    await created.load();
    return { workspace: created, directory };
  }
  const closer = () => {
    const listeners: Array<() => void> = [];
    return {
      onClosed: (listener: () => void) => listeners.push(listener),
      close: () => listeners.forEach((listener) => listener()),
    };
  };
  const windowWith = (
    panes: PersistedWorkspaceWindow["tabs"][number]["panes"],
  ): PersistedWorkspaceWindow => ({
    selected: 0,
    tabs: [
      {
        layout:
          panes.length === 1
            ? { pane: 0 }
            : {
                direction: "column",
                children: panes.map((_pane, index) => ({ pane: index })),
                weights: panes.map(() => 1 / panes.length),
              },
        focused: 0,
        panes,
      },
    ],
  });

  it("keeps only the last window and reopens it with tokens and labels", async () => {
    const { workspace, directory } = await service();
    expect(workspace.startupWindowCount(true)).toBe(1);
    await workspace.setRestore(true);
    const first = closer();
    const second = closer();
    const one = workspace.windowOptions(1, first.onClosed);
    const two = workspace.windowOptions(2, second.onClosed);
    expect(one.workspacePlan!()).toBeNull();
    const project = path.join(directory, "project");
    await mkdir(project);
    one.onWorkspace!(windowWith([{ kind: "shell" }]));
    two.onWorkspace!(
      windowWith([
        { kind: "shell", directory: project },
        { kind: "shell", directory: "/gone" },
        { kind: "saved-session", id: "work" },
        { kind: "saved-session", id: "deleted" },
        { kind: "quick-ssh", target: "admin@host" },
      ]),
    );
    first.close();
    second.close();
    workspace.saveOnExit();

    const { workspace: next } = await service();
    expect(next.restoreEnabled()).toBe(true);
    expect(next.startupWindowCount(true)).toBe(1);
    const options = next.windowOptions(3, closer().onClosed);
    const plan = options.workspacePlan!()!;
    expect(options.workspacePlan!()).toBeNull();
    const panes = plan.tabs[0]!.panes;
    expect(panes[0]).toMatchObject({ kind: "shell" });
    const token = (panes[0] as { token: string }).token;
    expect(options.resolveRestoredDirectory!(token)).toBe(project);
    expect(panes.slice(1)).toEqual([
      { kind: "shell" },
      { kind: "saved-session", id: "work", label: "Work", color: "#336699" },
      { kind: "shell" },
      { kind: "quick-ssh", target: "admin@host" },
    ]);
  });

  it("keeps every window when quitting, skips restore on request, forgets when off", async () => {
    let quitting = false;
    const { workspace, directory } = await service({
      quitting: () => quitting,
    });
    await workspace.setRestore(true);
    const first = closer();
    const second = closer();
    workspace.windowOptions(1, first.onClosed).onWorkspace!(
      windowWith([{ kind: "shell" }]),
    );
    workspace.windowOptions(2, second.onClosed).onWorkspace!(
      windowWith([{ kind: "shell" }]),
    );
    quitting = true;
    first.close();
    second.close();
    workspace.saveOnExit();
    const { workspace: next } = await service();
    expect(next.startupWindowCount(false)).toBe(1);
    expect(
      next.windowOptions(1, closer().onClosed).workspacePlan!(),
    ).toBeNull();
    expect(next.startupWindowCount(true)).toBe(2);
    await next.setRestore(false);
    const stored = JSON.parse(
      await readFile(path.join(directory, "workspace.json"), "utf8"),
    ) as { data: { windows: unknown[] } };
    expect(stored.data.windows).toEqual([]);
  });
});

describe("restoring tabs in the renderer", () => {
  it("rebuilds tabs, layouts and launches, then reports the window", async () => {
    const onWorkspaceChange = vi.fn();
    const harness = createTabsHarness({
      onWorkspaceChange,
      initialWorkspace: {
        selected: 1,
        tabs: [
          { layout: { pane: 0 }, focused: 0, panes: [{ kind: "shell" }] },
          {
            layout: twoPanes,
            focused: 1,
            panes: [
              { kind: "shell", token: "r0123456789abcdef" },
              {
                kind: "saved-session",
                id: "work",
                label: "Work",
                color: "#336699",
              },
            ],
          },
        ],
      },
    });
    await harness.tabs.ready;
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(3));
    expect(
      harness.createAdapter.mock.calls.map((call) => (call as unknown[])[0]),
    ).toEqual([
      undefined,
      { kind: "restored", token: "r0123456789abcdef" },
      { kind: "saved-session", id: "work" },
    ]);
    const tabs = [...harness.container.children] as HTMLElement[];
    expect(tabs.map((tab) => tab.hidden)).toEqual([true, false]);
    expect(tabs[1]!.classList.contains("split")).toBe(true);
    await vi.waitFor(() => expect(onWorkspaceChange).toHaveBeenCalled());
    expect(onWorkspaceChange.mock.lastCall![0]).toEqual({
      selected: 1,
      tabs: [
        { layout: { pane: 0 }, focused: 0, panes: [{ sessionId: "s1" }] },
        {
          layout: twoPanes,
          focused: 1,
          panes: [
            { sessionId: "s2" },
            { sessionId: "s3", launch: { kind: "saved-session", id: "work" } },
          ],
        },
      ],
    });
  });
});
