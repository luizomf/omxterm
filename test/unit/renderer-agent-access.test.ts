import { expect, it, vi } from "vitest";
import { subscribeToAgentAccess } from "../../src/renderer/agent-access";
import type {
  AgentAccessBridge,
  AgentAccessState,
  AgentReadRequest,
} from "../../src/shared/agent-access";
import { translatorFor } from "../../src/shared/i18n";
import type { StateMark, StateText } from "../../src/renderer/state-marks";

function bridge() {
  let state: ((value: AgentAccessState) => void) | undefined;
  let read: ((value: AgentReadRequest) => void) | undefined;
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
  } satisfies AgentAccessBridge;
  return {
    bridge: value,
    state: (next: AgentAccessState) => state?.(next),
    read: (next: AgentReadRequest) => read?.(next),
    subscribed: () => state !== undefined || read !== undefined,
  };
}

const { t } = translatorFor("en-US");
const say = (text: StateText) => (typeof text === "string" ? text : text(t));
const fakeTabs = () => ({
  setWindowMark: vi.fn<(owner: string, mark: StateMark | undefined) => void>(),
  flash: vi.fn<(text: StateText) => void>(),
  readSession: vi.fn(),
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
  };
  subscribeToAgentAccess(main.bridge, tabs);
  main.read({ id: result.id, sessionId: "s2", lines: 5 });
  expect(tabs.readSession).toHaveBeenCalledWith(result.id, "s2", 5);
  expect(main.bridge.readResult).toHaveBeenCalledWith(result);
});
