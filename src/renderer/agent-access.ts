import type { AgentAccessBridge, AgentRefusal } from "../shared/agent-access";
import type { MessageKey } from "../shared/i18n";
import type { TerminalTabs } from "./terminal-tabs";

const refusals: Readonly<Record<AgentRefusal, MessageKey>> = {
  "in-use": "agent.refused.in-use",
  "path-too-long": "agent.refused.path-too-long",
  unavailable: "agent.refused.unavailable",
  unsupported: "agent.refused.unsupported",
};

/**
 * The window's agent grant (ADR 0052): one accent mark on every pane and
 * tab while it lasts, a click on a pane's mark to stop it, the pane text
 * main asks for, and presses encoded for a pane's modes. Main admits agents
 * only after shown() confirms the marks.
 */
export function subscribeToAgentAccess(
  bridge: AgentAccessBridge,
  tabs: Pick<
    TerminalTabs,
    "setWindowMark" | "flash" | "readSession" | "encodeSessionKeys"
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
  return () => {
    removeState();
    removeRead();
    removePress();
  };
}
