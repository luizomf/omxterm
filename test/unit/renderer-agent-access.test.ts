import { expect, it, vi } from "vitest";
import { subscribeToAgentAccess } from "../../src/renderer/agent-access";
import type {
  AgentAccessBridge,
  AgentAccessState,
  AgentPressRequest,
  AgentReadRequest,
} from "../../src/shared/agent-access";
import { translatorFor } from "../../src/shared/i18n";
import type { StateMark, StateText } from "../../src/renderer/state-marks";

function bridge() {
  let state: ((value: AgentAccessState) => void) | undefined;
  let read: ((value: AgentReadRequest) => void) | undefined;
  let press: ((value: AgentPressRequest) => void) | undefined;
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
  } satisfies AgentAccessBridge;
  return {
    bridge: value,
    state: (next: AgentAccessState) => state?.(next),
    read: (next: AgentReadRequest) => read?.(next),
    press: (next: AgentPressRequest) => press?.(next),
    subscribed: () =>
      state !== undefined || read !== undefined || press !== undefined,
  };
}

const { t } = translatorFor("en-US");
const say = (text: StateText) => (typeof text === "string" ? text : text(t));
const fakeTabs = () => ({
  setWindowMark: vi.fn<(owner: string, mark: StateMark | undefined) => void>(),
  flash: vi.fn<(text: StateText) => void>(),
  readSession: vi.fn(),
  encodeSessionKeys: vi.fn(),
});

it("shows the accent mark before confirming, flashes once and stops on click", () => {
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
    "Agents can now control and read this window. Click ◆ to stop.",
  ]);
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
  };
  subscribeToAgentAccess(main.bridge, tabs);
  main.read({ id: result.id, sessionId: "s2", lines: 5 });
  expect(tabs.readSession).toHaveBeenCalledWith(result.id, "s2", 5);
  expect(main.bridge.readResult).toHaveBeenCalledWith(result);
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
