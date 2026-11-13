import type {
  AgentAccessBridge,
  AgentPressResult,
  AgentRefusal,
  AgentTabsResult,
} from "../shared/agent-access";
import { agentChordKey, type AgentKeyChord } from "../shared/agent-api";
import type { TerminalSurface } from "../terminal-surface/terminal-surface";
import type { MessageKey } from "../shared/i18n";
import type { TerminalTabs } from "./terminal-tabs";

const refusals: Readonly<Record<AgentRefusal, MessageKey>> = {
  "in-use": "agent.refused.in-use",
  "path-too-long": "agent.refused.path-too-long",
  unavailable: "agent.refused.unavailable",
  unsupported: "agent.refused.unsupported",
};

/**
 * The window's agent grant (ADR 0052): one mark in the error tone on every
 * pane and tab while it lasts, a click on a pane's mark to stop it, the pane
 * text and tab list main asks for, presses encoded for a pane's modes, and
 * the tab and pane shortcuts an agent presses. Main admits agents only after
 * shown() confirms the marks.
 */
export function subscribeToAgentAccess(
  bridge: AgentAccessBridge,
  tabs: Pick<
    TerminalTabs,
    | "setWindowMark"
    | "flash"
    | "readSession"
    | "encodeSessionKeys"
    | "agentTabs"
    | "runSessionCommand"
  >,
): () => void {
  let granted = false;
  const removeState = bridge.onState((state) => {
    if (state.state === "off") {
      granted = false;
      tabs.setWindowMark("agent", undefined);
      if (state.refused) tabs.flash((t) => t(refusals[state.refused!]));
      return;
    }
    tabs.setWindowMark("agent", {
      glyph: "agent",
      label: (t) => t("agent.mark"),
      action: { label: (t) => t("agent.clickToStop"), run: bridge.stop },
    });
    if (state.state === "pending") bridge.shown();
    else if (!granted) tabs.flash((t) => t("agent.allowed"));
    granted = state.state === "granted";
  });
  const removeRead = bridge.onRead((request) =>
    bridge.readResult(
      tabs.readSession(request.id, request.sessionId, request.lines),
    ),
  );
  const removePress = bridge.onPress((request) =>
    bridge.pressResult(
      tabs.encodeSessionKeys(request.id, request.sessionId, request.keys),
    ),
  );
  const removeTabs = bridge.onTabs((request) =>
    bridge.tabsResult(tabs.agentTabs(request.id)),
  );
  const removeAction = bridge.onAction((request) =>
    bridge.actionResult(
      tabs.runSessionCommand(request.id, request.sessionId, request.command),
    ),
  );
  return () => {
    removeAction();
    removeTabs();
    removeState();
    removeRead();
    removePress();
  };
}

/**
 * One press's bytes from a pane's Surface, all keys against the same modes,
 * joined for one write. A Surface that can't take input, or whose encoder
 * fails, answers unavailable at once.
 */
export function encodeAgentKeys(
  id: string,
  surface: Pick<TerminalSurface, "encodeKeyPress"> | undefined,
  keys: readonly AgentKeyChord[],
): AgentPressResult {
  if (!surface) return { id, error: "unknown-pane" };
  try {
    let data = "";
    for (const chord of keys) {
      const bytes = surface.encodeKeyPress?.(agentChordKey(chord));
      if (bytes === undefined) return { id, error: "unavailable" };
      data += bytes;
    }
    return { id, data };
  } catch {
    return { id, error: "unavailable" };
  }
}
