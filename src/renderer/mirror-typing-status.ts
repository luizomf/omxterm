import { retainDismissalGesture } from "./about/about-dialog";
import type { RendererLanguage } from "./renderer-language";
import type { TerminalPane } from "./terminal-panes";

export function createMirrorTypingStatus(
  parent: HTMLElement,
  language: RendererLanguage,
  stop: () => void,
) {
  const document = parent.ownerDocument;
  const row = document.createElement("section");
  row.className = "mirror-typing-status";
  row.hidden = true;
  const text = document.createElement("span");
  text.setAttribute("role", "status");
  const button = document.createElement("button");
  button.type = "button";
  const limitation = document.createElement("small");
  row.append(text, button, limitation);
  (parent.closest("#terminal-window-content") ?? parent).before(row);
  const keyboard = retainDismissalGesture(document);
  // The Start gesture originated in another WebContents. Retain both possible
  // activation releases; a fresh non-repeat press releases each guard normally.
  const enter = retainDismissalGesture(document);
  const space = retainDismissalGesture(document);
  let state:
    "preparing" | "active" | "stopped" | "semantic" | "failed" | undefined;
  let members: readonly TerminalPane[] = [];
  let source: TerminalPane | undefined;
  const markers = new Map<TerminalPane, HTMLElement>();
  const render = () => {
    row.hidden = !state;
    text.textContent = state
      ? language.t(`mirrorTyping.${state}`, { count: members.length })
      : "";
    button.hidden = state !== "active" && state !== "preparing";
    button.textContent = language.t(
      state === "preparing" ? "mirrorTyping.cancel" : "mirrorTyping.stop",
    );
    limitation.textContent = language.t("mirrorTyping.limitation");
    limitation.hidden = state !== "active" && state !== "preparing";
    for (const [pane, marker] of markers) {
      marker.textContent = `↔ ${language.t(pane === source ? "mirrorTyping.source" : "mirrorTyping.member")}`;
    }
  };
  const removeLanguage = language.bind(render);
  button.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    keyboard.settle(event);
    stop();
  });
  button.addEventListener("click", stop);
  return {
    guardStart() {
      const Keyboard = document.defaultView!.KeyboardEvent;
      enter.settle(new Keyboard("keydown", { key: "Enter", code: "Enter" }));
      space.settle(new Keyboard("keydown", { key: " ", code: "Space" }));
    },
    show(
      next: typeof state,
      panes: readonly TerminalPane[] = [],
      focused?: TerminalPane,
    ) {
      state = next;
      members = panes;
      source = focused;
      for (const [pane, marker] of markers)
        if (!panes.includes(pane)) {
          marker.remove();
          pane.container.classList.remove("pane-mirroring");
          markers.delete(pane);
        }
      for (const pane of panes)
        if (!markers.has(pane)) {
          const marker = document.createElement("span");
          marker.className = "mirror-typing-marker";
          pane.container.classList.add("pane-mirroring");
          pane.container.append(marker);
          markers.set(pane, marker);
        }
      render();
    },
    dispose() {
      removeLanguage();
      keyboard.dispose();
      enter.dispose();
      space.dispose();
      for (const [pane, marker] of markers) {
        marker.remove();
        pane.container.classList.remove("pane-mirroring");
      }
      row.remove();
    },
  };
}
