import { expect, it, vi } from "vitest";
import {
  encodeAgentKeys,
  subscribeToAgentAccess,
} from "../../src/renderer/agent-access";
import type {
  AgentAccessBridge,
  AgentAccessState,
  AgentActionRequest,
  AgentPressRequest,
  AgentReadRequest,
  AgentTabsRequest,
} from "../../src/shared/agent-access";
import { translatorFor } from "../../src/shared/i18n";
import type { StateMark, StateText } from "../../src/renderer/state-marks";

function bridge() {
  let state: ((value: AgentAccessState) => void) | undefined;
  let read: ((value: AgentReadRequest) => void) | undefined;
  let press: ((value: AgentPressRequest) => void) | undefined;
  let tabsListener: ((value: AgentTabsRequest) => void) | undefined;
  let action: ((value: AgentActionRequest) => void) | undefined;
  const value = {
    onState: vi.fn((listener: (value: AgentAccessState) => void) => {
      state = listener;
      return () => (state = undefined);
    }),
    shown: vi.fn(),
    stop: vi.fn(),
    onRead: vi.fn((listener: (value: AgentReadRequest) => void) => {
      read = listener;
      return () => (read = undefined);
    }),
    readResult: vi.fn(),
    onPress: vi.fn((listener: (value: AgentPressRequest) => void) => {
      press = listener;
      return () => (press = undefined);
    }),
    pressResult: vi.fn(),
    onTabs: vi.fn((listener: (value: AgentTabsRequest) => void) => {
      tabsListener = listener;
      return () => (tabsListener = undefined);
    }),
    tabsResult: vi.fn(),
    onAction: vi.fn((listener: (value: AgentActionRequest) => void) => {
      action = listener;
      return () => (action = undefined);
    }),
    actionResult: vi.fn(),
  } satisfies AgentAccessBridge;
  return {
    bridge: value,
    state: (next: AgentAccessState) => state?.(next),
    read: (next: AgentReadRequest) => read?.(next),
    press: (next: AgentPressRequest) => press?.(next),
    tabs: (next: AgentTabsRequest) => tabsListener?.(next),
    action: (next: AgentActionRequest) => action?.(next),
    subscribed: () =>
      state !== undefined ||
      read !== undefined ||
      press !== undefined ||
      tabsListener !== undefined ||
      action !== undefined,
  };
}

const { t } = translatorFor("en-US");
const say = (text: StateText) => (typeof text === "string" ? text : text(t));
const fakeTabs = () => ({
  setWindowMark: vi.fn<(owner: string, mark: StateMark | undefined) => void>(),
  flash: vi.fn<(text: StateText) => void>(),
  readSession: vi.fn(),
  encodeSessionKeys: vi.fn(),
  agentTabs: vi.fn(),
  runSessionCommand: vi.fn(),
});

it("shows the mark before confirming, flashes once and stops on click", () => {
  const main = bridge();
  const tabs = fakeTabs();
  const unsubscribe = subscribeToAgentAccess(main.bridge, tabs);

  main.state({ state: "pending" });
  expect(tabs.setWindowMark).toHaveBeenCalledOnce();
  const [owner, mark] = tabs.setWindowMark.mock.calls[0]!;
  expect(owner).toBe("agent");
  expect(mark?.glyph).toBe("agent");
  // Main hears "shown" only after the mark is on the page.
  expect(main.bridge.shown).toHaveBeenCalledOnce();
  expect(tabs.flash).not.toHaveBeenCalled();

  main.state({ state: "granted" });
  expect(tabs.flash.mock.calls.map(([text]) => say(text))).toEqual([
    "Agents can now do anything you can in this window. Click ◆ to stop them.",
  ]);
  expect(say(mark!.label)).toBe(
    "Agents can do anything you can in this window.",
  );
  expect(say(mark!.action!.label)).toBe("Click this mark to stop them.");
  mark?.action?.run();
  expect(main.bridge.stop).toHaveBeenCalledOnce();

  main.state({ state: "off" });
  expect(tabs.setWindowMark).toHaveBeenLastCalledWith("agent", undefined);
  expect(tabs.flash).toHaveBeenCalledOnce();

  main.state({ state: "off", refused: "in-use" });
  expect(say(tabs.flash.mock.calls.at(-1)![0])).toBe(
    "Another OMXTerm is already serving agents for this profile.",
  );
  unsubscribe();
  expect(main.subscribed()).toBe(false);
});

it("answers main's reads with the pane's text", () => {
  const main = bridge();
  const result = {
    id: "00000000-0000-0000-0000-000000000001",
    text: "hi",
    truncated: false,
  };
  const tabs = {
    setWindowMark: vi.fn(),
    flash: vi.fn(),
    readSession: vi.fn(() => result),
    encodeSessionKeys: vi.fn(),
    agentTabs: vi.fn(),
    runSessionCommand: vi.fn(),
  };
  subscribeToAgentAccess(main.bridge, tabs);
  main.read({ id: result.id, sessionId: "s2", lines: 5 });
  expect(tabs.readSession).toHaveBeenCalledWith(result.id, "s2", 5);
  expect(main.bridge.readResult).toHaveBeenCalledWith(result);
});

it("answers main's tab requests with the window's tabs", () => {
  const main = bridge();
  const id = "00000000-0000-0000-0000-000000000007";
  const result = {
    id,
    tabs: [{ tab: "t1", title: "zsh", selected: true, panes: ["s1"] }],
  };
  const tabs = { ...fakeTabs(), agentTabs: vi.fn(() => result) };
  subscribeToAgentAccess(main.bridge, tabs as never);
  main.tabs({ id });
  expect(tabs.agentTabs).toHaveBeenCalledWith(id);
  expect(main.bridge.tabsResult).toHaveBeenCalledWith(result);
});

it("runs main's shortcut actions on the pane they name and answers", async () => {
  const main = bridge();
  const id = "00000000-0000-0000-0000-000000000009";
  const tabs = {
    ...fakeTabs(),
    runSessionCommand: vi.fn(async () => ({ id })),
  };
  subscribeToAgentAccess(main.bridge, tabs);
  main.action({ id, sessionId: "s3", command: { action: "close-pane" } });
  expect(tabs.runSessionCommand).toHaveBeenCalledWith(id, "s3", {
    action: "close-pane",
  });
  await vi.waitFor(() =>
    expect(main.bridge.actionResult).toHaveBeenCalledWith({ id }),
  );
});

it("answers main's presses with the pane's encoded bytes", () => {
  const main = bridge();
  const id = "00000000-0000-0000-0000-000000000003";
  const keys = [{ key: "Up", ctrl: false, alt: false, shift: false }];
  const tabs = {
    ...fakeTabs(),
    encodeSessionKeys: vi.fn(() => ({ id, data: "\x1bOA" })),
  };
  subscribeToAgentAccess(main.bridge, tabs);
  main.press({ id, sessionId: "s2", keys });
  expect(tabs.encodeSessionKeys).toHaveBeenCalledWith(id, "s2", keys);
  expect(main.bridge.pressResult).toHaveBeenCalledWith({ id, data: "\x1bOA" });
});

it("joins a press's keys from the pane's Surface, or says why it can't", () => {
  const id = "00000000-0000-0000-0000-000000000005";
  const up = { key: "Up", ctrl: false, alt: false, shift: false };
  const f5 = { key: "F5", ctrl: true, alt: false, shift: false };
  const surface = {
    encodeKeyPress: vi.fn(
      (key: { key: string; ctrlKey: boolean }) =>
        `<${key.ctrlKey ? "C-" : ""}${key.key}>`,
    ),
  };
  expect(encodeAgentKeys(id, surface, [up, f5, up])).toEqual({
    id,
    data: "<ArrowUp><C-F5><ArrowUp>",
  });
  expect(encodeAgentKeys(id, undefined, [up])).toEqual({
    id,
    error: "unknown-pane",
  });
  expect(
    encodeAgentKeys(id, { encodeKeyPress: () => undefined }, [up]),
  ).toEqual({ id, error: "unavailable" });
  const broken = {
    encodeKeyPress: () => {
      throw new Error("core gone");
    },
  };
  expect(encodeAgentKeys(id, broken, [up])).toEqual({
    id,
    error: "unavailable",
  });
});
