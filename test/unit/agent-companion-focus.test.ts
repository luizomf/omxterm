// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { fixture, settle } from "../fixtures/companion-content";
import { cleanupSnippetsWindows } from "../fixtures/snippets-window";
import type {
  AgentAccessBridge,
  AgentAccessState,
  AgentActionRequest,
} from "../../src/shared/agent-access";

afterEach(() => cleanupSnippetsWindows());

it("shows an extension tab for an agent's shortcut without native focus while the user is in another window", async () => {
  let action: ((request: AgentActionRequest) => void) | undefined;
  let state: ((value: AgentAccessState) => void) | undefined;
  const agent: AgentAccessBridge = {
    onState(listener) {
      state = listener;
      return () => {};
    },
    shown: vi.fn(),
    stop: vi.fn(),
    onRead: () => () => {},
    readResult: vi.fn(),
    onPress: () => () => {},
    pressResult: vi.fn(),
    onTabs: () => () => {},
    tabsResult: vi.fn(),
    onAction(listener) {
      action = listener;
      return () => {};
    },
    actionResult: vi.fn(),
    onActionCancel: () => () => {},
  };
  const f = await fixture({
    attention: {
      notify: vi.fn(),
      onSessionAttention: () => () => {},
      onAttentionSound: () => () => {},
      agent,
    },
  });
  state!({ state: "granted" });
  f.open("general", false);
  await settle();
  f.tabCommand({ action: "select", position: 1 });
  await settle();
  const present = vi.mocked(f.bridge.present);
  present.mockClear();
  vi.spyOn(document, "hasFocus").mockReturnValue(false);
  const id = "00000000-0000-0000-0000-000000000001";
  action!({ id, sessionId: "s1", command: { action: "next" } });
  await settle();
  expect(agent.actionResult).toHaveBeenCalledWith({ id });
  expect(present.mock.lastCall?.[0]).toMatchObject({
    id: "general",
    focus: false,
  });
});
