// @vitest-environment jsdom
// The agent mark is the panic button (ADR 0052): one click stops everything,
// and some mark can always be clicked.
import { afterEach, expect, it, vi } from "vitest";
import { subscribeToAgentAccess } from "../../src/renderer/agent-access";
import type {
  AgentAccessBridge,
  AgentAccessState,
  AgentActionRequest,
} from "../../src/shared/agent-access";
import type { HostedContentBridge } from "../../src/shared/extension-view";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";
import { deferred } from "../fixtures/settings-dialog-dom";

const owners: { dispose(): void }[] = [];
afterEach(() => {
  owners.splice(0).forEach((owner) => owner.dispose());
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

async function grantedWindow() {
  let open!: Parameters<HostedContentBridge["onOpen"]>[0];
  const hosted: HostedContentBridge = {
    onOpen: (listener) => ((open = listener), vi.fn()),
    onRetired: () => vi.fn(),
    onFailure: () => vi.fn(),
    present: vi.fn(async () => true),
    close: vi.fn(async () => {}),
  };
  const h = createTabsHarness({ tabsOptions: { hostedContent: hosted } });
  owners.push(h.tabs);
  await h.tabs.ready;
  let state!: (value: AgentAccessState) => void;
  let action!: (request: AgentActionRequest) => void;
  const agent: AgentAccessBridge = {
    onState: (listener) => ((state = listener), () => {}),
    shown: vi.fn(),
    stop: vi.fn(),
    onRead: () => () => {},
    readResult: vi.fn(),
    onPress: () => () => {},
    pressResult: vi.fn(),
    onModes: () => () => {},
    modesResult: vi.fn(),
    onTabs: () => () => {},
    tabsResult: vi.fn(),
    onAction: (listener) => ((action = listener), () => {}),
    actionResult: vi.fn(),
    onActionCancel: () => () => {},
  };
  owners.push({ dispose: subscribeToAgentAccess(agent, h.tabs) });
  state({ state: "granted" });
  return {
    ...h,
    hosted,
    agent,
    action,
    openExtension: async () => {
      open({ id: "view-a", title: "view-a" });
      await settle();
    },
    corner: () =>
      document.querySelector<HTMLButtonElement>(".state-marks-corner button"),
  };
}

it("never runs an action already handed over once the user clicks the mark", async () => {
  const w = await grantedWindow();
  w.tabs.handleCommand({ action: "new" });
  await vi.waitFor(() => expect(w.surfaces).toHaveLength(2));
  await w.openExtension();
  // The agent closes a pane in another tab; leaving the extension's view
  // waits for main to hide it, and the user clicks the mark meanwhile.
  const hidden = deferred<boolean>();
  vi.mocked(w.hosted.present).mockImplementationOnce(() => hidden.promise);
  const id = "00000000-0000-0000-0000-000000000001";
  w.action({ id, sessionId: "s1", command: { action: "close-pane" } });
  await settle();
  w.corner()!.click();
  expect(w.agent.stop).toHaveBeenCalledOnce();
  hidden.resolve(true);
  await settle();
  expect(w.agent.actionResult).toHaveBeenCalledWith({
    id,
    error: "unavailable",
  });
  expect(w.surfaces[0]!.dispose).not.toHaveBeenCalled();
});

it("keeps a clickable mark in the corner until the terminal tab's panes show", async () => {
  const w = await grantedWindow();
  await w.openExtension();
  expect(w.corner()).not.toBeNull();
  // The user goes back to the terminal; main hasn't hidden the view yet.
  const hidden = deferred<boolean>();
  vi.mocked(w.hosted.present).mockImplementationOnce(() => hidden.promise);
  w.tabs.handleCommand({ action: "select", position: 1 });
  await settle();
  expect(w.corner()).not.toBeNull();
  // A view that won't hide leaves the panes hidden: the corner stays.
  hidden.resolve(false);
  await settle();
  expect(w.corner()).not.toBeNull();
  w.corner()!.click();
  expect(w.agent.stop).toHaveBeenCalledOnce();
});

it("moves the mark from the corner to the pane once it shows", async () => {
  const w = await grantedWindow();
  await w.openExtension();
  w.tabs.handleCommand({ action: "select", position: 1 });
  await settle();
  expect(w.corner()).toBeNull();
  expect(
    w.container.querySelector('.state-marks button[data-glyph="agent"]'),
  ).not.toBeNull();
});
