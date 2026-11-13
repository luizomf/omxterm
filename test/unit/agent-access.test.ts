import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { EventEmitter } from "node:events";
import path from "node:path";
import { expect, vi } from "vitest";
import { agentSocketPath, startAgentAccess } from "../../src/main/agent-access";
import { agentIpc } from "../../src/shared/agent-access";
import { useAgentHarness } from "../fixtures/agent-access-harness";
import { createIpcHarness } from "../fixtures/terminal-ipc-harness";

const { posix, cleanups, ctl, sessions, setup } = useAgentHarness();

posix(
  "grants only after the window shows its marks, then a pane's client drives it",
  async () => {
    const { profile, pane, access, window, states, shown, grants, port } =
      setup();
    expect((await ctl(profile, ["status"], pane)).code).toBe(3);

    access.toggle(window);
    expect(states()).toEqual([{ state: "pending" }]);
    // No mark on screen yet: nothing listens and no credential exists.
    expect(existsSync(agentSocketPath(profile))).toBe(false);
    expect(grants()).toEqual([]);

    await shown();
    expect(access.granted(window)).toBe(true);
    const grantFile = path.join(profile, "agent-api", "grants", "1.json");
    expect(statSync(grantFile).mode & 0o777).toBe(0o600);
    const credential = JSON.parse(readFileSync(grantFile, "utf8")) as object;
    expect(Object.keys(credential)).toEqual([
      "version",
      "instance",
      "window",
      "endpoint",
      "token",
    ]);

    const status = await ctl(profile, ["status"], pane);
    expect(status).toMatchObject({ code: 0 });
    const list = await ctl(profile, ["list", "--json"], pane);
    const { tabs } = JSON.parse(list.stdout) as {
      tabs: { tab: string; selected: boolean; panes: { self: boolean }[] }[];
    };
    expect(tabs.map((tab) => [tab.tab, tab.selected])).toEqual([
      ["t1", true],
      ["t2", false],
    ]);
    expect(tabs.flatMap((tab) => tab.panes.map((pane) => pane.self))).toEqual([
      true,
      false,
    ]);
    // Plain output: a line per tab, its panes indented under it.
    expect((await ctl(profile, ["list"], pane)).stdout).toBe(
      "t1\tzsh\tselected\n  s1\t80x24\tfocused\tself\nt2\tvim\n  s2\t80x24\n",
    );
    await ctl(profile, ["send", "s2", "--text", "ls -la", "--enter"], pane);
    expect(port.writes).toEqual([["s2", "ls -la\r"]]);
    expect((await ctl(profile, ["read", "s2"], pane)).stdout).toBe(
      "text of s2\n",
    );
    expect((await ctl(profile, ["read", "2:s2"], pane)).code).toBe(2);
  },
);

posix(
  "ends on a mark click, removing the socket and the credential",
  async () => {
    const {
      profile,
      pane,
      access,
      window,
      ipc,
      event,
      states,
      shown,
      grants,
      changed,
    } = setup();
    access.toggle(window);
    await shown();
    ipc.listeners.get(agentIpc.stop)!(event);
    expect(states().at(-1)).toEqual({ state: "off" });
    expect(access.granted(window)).toBe(false);
    expect(existsSync(agentSocketPath(profile))).toBe(false);
    expect(grants()).toEqual([]);
    expect(changed).toHaveBeenCalled();
    expect((await ctl(profile, ["status"], pane)).code).toBe(3);
  },
);

posix(
  "can't be granted by the renderer, and ends on reload or window loss",
  async () => {
    const { access, window, contents, ipc, event, states, shown } = setup();
    // A confirmation nobody asked for grants nothing.
    ipc.listeners.get(agentIpc.shown)!(event);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(states()).toEqual([]);
    expect(access.granted(window)).toBe(false);

    access.toggle(window);
    await shown();
    contents.emit(
      "did-start-navigation",
      {},
      "file:///index.html",
      false,
      true,
    );
    expect(access.granted(window)).toBe(false);

    access.toggle(window);
    await shown();
    window.emit("closed");
    expect(access.granted(window)).toBe(false);
  },
);

posix("refuses where it can't keep its side and says why", async () => {
  const windows = setup("win32");
  windows.access.toggle(windows.window);
  expect(windows.states()).toEqual([{ state: "off", refused: "unsupported" }]);
  // The menu's check mark resyncs after a refusal, too.
  expect(windows.changed).toHaveBeenCalled();

  const first = setup();
  first.access.toggle(first.window);
  await first.shown();
  // A second process on the same profile, like a source run beside the app.
  const second = setup();
  const secondIpc = createIpcHarness();
  const crowded = startAgentAccess({
    ipc: secondIpc.ipcMain,
    trusted: () => true,
    profile: first.profile,
    platform: process.platform,
  });
  cleanups.push(() => crowded.dispose());
  crowded.register(second.window, 1, sessions());
  crowded.toggle(second.window);
  secondIpc.listeners.get(agentIpc.shown)!(second.event);
  await vi.waitFor(() =>
    expect(second.states().at(-1)).toEqual({ state: "off", refused: "in-use" }),
  );
  expect(crowded.granted(second.window)).toBe(false);
  expect(first.access.granted(first.window)).toBe(true);
  expect(first.grants()).toEqual(["1.json"]);

  const deep = setup();
  const longProfile = path.join(deep.profile, "x".repeat(120));
  const tooLong = startAgentAccess({
    ipc: createIpcHarness().ipcMain,
    trusted: () => true,
    profile: longProfile,
    platform: process.platform,
  });
  cleanups.push(() => tooLong.dispose());
  tooLong.register(deep.window, 1, sessions());
  tooLong.toggle(deep.window);
  expect(deep.states().at(-1)).toEqual({
    state: "off",
    refused: "path-too-long",
  });
});

posix(
  "removes a crashed run's leftovers but never a live process's",
  async () => {
    const live = setup();
    live.access.toggle(live.window);
    await live.shown();
    const other = startAgentAccess({
      ipc: createIpcHarness().ipcMain,
      trusted: () => false,
      profile: live.profile,
      platform: process.platform,
    });
    await other.removeLeftovers();
    expect(live.grants()).toEqual(["1.json"]);
    other.dispose();

    const crashed = setup();
    const grantsDirectory = path.join(crashed.profile, "agent-api", "grants");
    mkdirSync(grantsDirectory, { recursive: true });
    writeFileSync(path.join(grantsDirectory, "9.json"), "{}", { mode: 0o600 });
    writeFileSync(path.join(grantsDirectory, "notes.txt"), "keep");
    await crashed.access.removeLeftovers();
    expect(crashed.grants()).toEqual(["notes.txt"]);
  },
);

posix(
  "keeps a pane's agent on its own process when another shares the profile",
  async () => {
    // Process A grants its window 1.
    const a = setup();
    a.access.toggle(a.window);
    await a.shown();
    // Process B, a source run on the same profile, also has a window 1 and s1.
    const b = startAgentAccess({
      ipc: createIpcHarness().ipcMain,
      trusted: () => true,
      profile: a.profile,
      platform: process.platform,
    });
    cleanups.push(() => b.dispose());
    expect(b.instance).not.toBe(a.access.instance);
    const fromB = `${b.instance}:1:s1`;
    expect(await ctl(a.profile, ["status"], fromB)).toMatchObject({ code: 3 });
    expect(
      (
        await ctl(
          a.profile,
          ["send", "s2", "--text", "rm -rf ~", "--enter"],
          fromB,
        )
      ).code,
    ).toBe(3);
    // Naming A's window explicitly from B's pane changes nothing.
    expect(
      (
        await ctl(
          a.profile,
          ["send", "s2", "--window", "1", "--text", "x"],
          fromB,
        )
      ).code,
    ).toBe(3);
    expect(a.port.writes).toEqual([]);
    // A's own pane still drives it.
    expect((await ctl(a.profile, ["status"], a.pane)).code).toBe(0);
  },
);

posix("admits once when the window confirms twice", async () => {
  const { profile, pane, access, window, ipc, event, states, grants } = setup();
  access.toggle(window);
  const shown = ipc.listeners.get(agentIpc.shown)!;
  shown(event);
  shown(event);
  await vi.waitFor(() => expect(states().at(-1)).toEqual({ state: "granted" }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(states()).toEqual([{ state: "pending" }, { state: "granted" }]);
  expect(grants()).toEqual(["1.json"]);
  expect((await ctl(profile, ["status"], pane)).code).toBe(0);
});

posix("sends nothing to a crashed window while ending its grant", async () => {
  const { access, window, contents, shown } = setup();
  access.toggle(window);
  await shown();
  const sent = contents.send.mock.calls.length;
  Object.assign(contents, { isCrashed: () => true });
  contents.emit("render-process-gone");
  expect(access.granted(window)).toBe(false);
  expect(contents.send.mock.calls).toHaveLength(sent);
});

posix(
  "presses into the granted window's pane, whichever window is selected",
  async () => {
    const { profile, pane, access, window, contents, port, shown } = setup();
    // Not granted yet: refused like send.
    expect((await ctl(profile, ["press", "s2", "Up"], pane)).code).toBe(3);
    access.toggle(window);
    await shown();
    // Another window of the same process, the one the user is in; never asked.
    const selected = Object.assign(new EventEmitter(), {
      webContents: Object.assign(new EventEmitter(), {
        mainFrame: {},
        isDestroyed: () => false,
        send: vi.fn(),
      }),
      isDestroyed: () => false,
    });
    const other = sessions();
    access.register(selected, 2, other);

    const pressed = await ctl(
      profile,
      ["press", "s2", "Up", "Ctrl+Down", "--json"],
      pane,
    );
    expect(pressed.code).toBe(0);
    expect(JSON.parse(pressed.stdout)).toEqual({
      receipt: "accepted",
      offset: 10,
    });
    expect(port.writes).toEqual([["s2", "<Up><C-Down>"]]);
    expect(
      contents.send.mock.calls.filter(
        ([channel]) => channel === agentIpc.press,
      ),
    ).toEqual([
      [
        agentIpc.press,
        {
          id: expect.any(String) as unknown,
          sessionId: "s2",
          keys: [
            { key: "Up", ctrl: false, alt: false, shift: false },
            { key: "Down", ctrl: true, alt: false, shift: false },
          ],
        },
      ],
    ]);
    expect(selected.webContents.send).not.toHaveBeenCalled();
    expect(other.writes).toEqual([]);

    const unknown = await ctl(profile, ["press", "s2", "Cmd+Q"], pane);
    expect(unknown.code).toBe(1);
    expect(port.writes).toHaveLength(1);
  },
);

posix("drops a press in flight when the user stops the grant", async () => {
  const { profile, pane, access, window, contents, port, ipc, event, shown } =
    setup();
  access.toggle(window);
  await shown();
  // The window takes its time to encode; the user clicks the mark meanwhile.
  contents.send.mockImplementation((channel: string) => {
    if (channel === agentIpc.press)
      setImmediate(() => ipc.listeners.get(agentIpc.stop)!(event));
  });
  const pressed = await ctl(profile, ["press", "s1", "Up"], pane);
  expect(pressed.code).toBe(1);
  expect(pressed.stderr).toMatch(/stopped agent access/u);
  expect(port.writes).toEqual([]);
});

posix("settles a read and a press only with their own answers", async () => {
  const { profile, pane, access, window, contents, port, ipc, event, shown } =
    setup();
  access.toggle(window);
  await shown();
  // The window answers each request first on the other channel, then on its own.
  contents.send.mockImplementation((channel: string, payload: unknown) => {
    const { id } = payload as { id: string };
    const read = () =>
      ipc.listeners.get(agentIpc.readResult)!(event, {
        id,
        text: "text",
        truncated: false,
      });
    const press = () =>
      ipc.listeners.get(agentIpc.pressResult)!(event, { id, data: "<ok>" });
    if (channel === agentIpc.press)
      setImmediate(() => {
        read();
        press();
      });
    if (channel === agentIpc.read)
      setImmediate(() => {
        press();
        read();
      });
  });
  expect((await ctl(profile, ["press", "s1", "Up"], pane)).code).toBe(0);
  expect(port.writes).toEqual([["s1", "<ok>"]]);
  expect((await ctl(profile, ["read", "s1"], pane)).stdout).toBe("text\n");
});
