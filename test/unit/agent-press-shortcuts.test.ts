import { expect, it, vi } from "vitest";
import {
  AgentApiError,
  createAgentCommands,
} from "../../src/main/agent-commands";
import {
  AGENT_SHORTCUTS,
  agentShortcutAction,
} from "../../src/main/agent-shortcuts";
import type { AgentSessionPort } from "../../src/main/terminal-ipc-types";
import {
  displayAccelerator,
  terminalDefaultKeybinds,
  TERMINAL_ACTION_NAMES,
  type TerminalKeybinds,
} from "../../src/shared/terminal-keybinds";

// One granted window: s1 (focused) and s2 in the selected tab, s3 hidden.
function grantedWindow(
  options: {
    keybinds?: TerminalKeybinds;
    busy?: readonly string[];
    platform?: string;
  } = {},
) {
  const platform = options.platform ?? "darwin";
  const keybinds = options.keybinds ?? terminalDefaultKeybinds(platform);
  const writes: string[] = [];
  const sessions: AgentSessionPort = {
    sessions: () => [],
    position: (id) =>
      ["s1", "s2", "s3"].includes(id)
        ? { sent: 0, acknowledged: 0 }
        : undefined,
    write(_id, data) {
      writes.push(data);
      return "accepted";
    },
    observe: () => () => {},
  };
  const act = vi.fn(async () => {});
  const encode = vi.fn(async () => "<key>");
  const closeNeedsUser = vi.fn((ids: readonly string[]) =>
    ids.some((id) => options.busy?.includes(id)),
  );
  let tabsAnswer = Promise.resolve([
    { tab: "t1", title: "zsh", selected: true, panes: ["s1", "s2"] as const },
    { tab: "t2", title: "vim", selected: false, panes: ["s3"] as const },
  ]);
  const commands = createAgentCommands({
    sessions,
    read: vi.fn(),
    encode,
    tabs: () => tabsAnswer,
    shortcut: (chord) => agentShortcutAction(keybinds, chord, platform),
    act,
    closeNeedsUser,
    platform,
  });
  const press = (pane: string, ...keys: string[]) =>
    commands
      .run("press", { pane, keys }, { signal: new AbortController().signal })
      .then(
        (result) => result,
        (error: unknown) => {
          if (error instanceof AgentApiError) return error.code;
          throw error;
        },
      );
  return {
    commands,
    press,
    act,
    encode,
    writes,
    closeNeedsUser,
    holdTabs(answer: Promise<never>) {
      tabsAnswer = answer;
    },
  };
}

it("runs a tab shortcut in the granted window on the pane it names and says so", async () => {
  const window = grantedWindow();
  await expect(window.press("s3", "Cmd+T")).resolves.toEqual({
    action: "newTab",
    pane: "s3",
  });
  expect(window.act).toHaveBeenCalledWith(
    "s3",
    { action: "new" },
    expect.any(AbortSignal),
  );
  expect(window.encode).not.toHaveBeenCalled();
  expect(window.writes).toEqual([]);
});

it("closes the named pane, not the focused one, unless a program runs there", async () => {
  const idle = grantedWindow({ busy: ["s1"] });
  await expect(idle.press("s2", "Cmd+Alt+W")).resolves.toEqual({
    action: "closePane",
    pane: "s2",
  });
  expect(idle.closeNeedsUser).toHaveBeenCalledWith(["s2"]);
  expect(idle.act).toHaveBeenCalledWith(
    "s2",
    { action: "close-pane" },
    expect.any(AbortSignal),
  );

  const busy = grantedWindow({ busy: ["s2"] });
  await expect(busy.press("s2", "Cmd+Alt+W")).resolves.toBe("needs-user");
  expect(busy.act).not.toHaveBeenCalled();
});

it("asks about every pane of the tab a close would take", async () => {
  const window = grantedWindow({ busy: ["s1"] });
  await expect(window.press("s2", "Cmd+W")).resolves.toBe("needs-user");
  expect(window.closeNeedsUser).toHaveBeenCalledWith(["s1", "s2"]);
  expect(window.act).not.toHaveBeenCalled();
  await expect(window.press("s3", "Cmd+W")).resolves.toEqual({
    action: "closeTab",
    pane: "s3",
  });
});

it("refuses the grant toggle by action, whatever key it is bound to", async () => {
  for (const binding of ["F9", "CommandOrControl+Shift+A"]) {
    const window = grantedWindow({
      keybinds: {
        ...terminalDefaultKeybinds("darwin"),
        toggleAgentAccess: binding,
      },
    });
    const chord = displayAccelerator(binding, "darwin")!;
    await expect(window.press("s1", chord)).resolves.toBe("refused");
    await expect(window.press("s1", "Up", chord)).resolves.toBe("refused");
    expect(window.act).not.toHaveBeenCalled();
    expect(window.encode).not.toHaveBeenCalled();
    expect(window.writes).toEqual([]);
  }
  // Unbound, F9 is just a key for the pane again.
  const window = grantedWindow();
  await expect(window.press("s1", "F9")).resolves.toMatchObject({
    receipt: "accepted",
  });
});

it("answers not yet for the Command Palette and Find, and runs nothing", async () => {
  const window = grantedWindow();
  await expect(window.press("s1", "Cmd+Shift+P")).resolves.toBe("not-yet");
  await expect(window.press("s1", "Cmd+F")).resolves.toBe("not-yet");
  expect(window.act).not.toHaveBeenCalled();
  expect(window.writes).toEqual([]);
});

it("takes a shortcut only on its own, and no chord the pane can't take", async () => {
  const window = grantedWindow();
  await expect(window.press("s1", "Down", "Cmd+T")).resolves.toBe(
    "invalid-request",
  );
  // Not a shortcut here, and not a key press can send to a pane.
  await expect(window.press("s1", "Cmd+K")).resolves.toBe("unsupported-key");
  expect(window.act).not.toHaveBeenCalled();
  expect(window.writes).toEqual([]);
});

it("runs nothing when the grant ends before a close", async () => {
  const window = grantedWindow();
  let answer!: (tabs: never) => void;
  window.holdTabs(new Promise<never>((resolve) => (answer = resolve)));
  const pressed = window.press("s1", "Cmd+W");
  window.commands.dispose();
  answer([{ tab: "t1", title: "", selected: true, panes: ["s1"] }] as never);
  await expect(pressed).resolves.toBe("revoked");
  expect(window.act).not.toHaveBeenCalled();
});

it("matches every default tab and pane shortcut as the user's press would", () => {
  for (const platform of ["darwin", "linux"]) {
    const keybinds = terminalDefaultKeybinds(platform);
    for (const action of TERMINAL_ACTION_NAMES) {
      const binding = keybinds[action];
      if (AGENT_SHORTCUTS[action].kind !== "run" || binding === null) continue;
      const chord = displayAccelerator(binding, platform)!;
      expect(agentShortcutAction(keybinds, chord, platform), chord).toBe(
        action,
      );
    }
  }
});
