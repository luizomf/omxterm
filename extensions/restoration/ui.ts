import {
  createApplicationPage,
  createPageButton,
  setPageNotice,
  type NoticeSeverity,
} from "../../src/renderer/application-page.js";
import type { StateDocument } from "./document.js";

export function createRestorationPage(document: Document) {
  const title = document.createElement("div");
  const heading = document.createElement("h2");
  heading.textContent = "Saved Layout";
  const eyebrow = document.createElement("p");
  eyebrow.className = "ui-meta";
  eyebrow.textContent = "One window · fresh shells · Linux ARM64 preview";
  title.append(heading, eyebrow);
  const notice = document.createElement("div");
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  const content = document.createElement("section");
  const introduction = document.createElement("p");
  introduction.className = "introduction ui-hint";
  introduction.textContent =
    "Save this window's terminal tabs, splits and available local folders. Opening starts new shells in a new window; current work stays open.";
  const summary = document.createElement("section");
  summary.className = "snapshot ui-card";
  summary.setAttribute("aria-label", "Saved snapshot");
  const actions = document.createElement("div");
  actions.className = "layout-actions ui-actions";
  const buttons = {
    open: createPageButton(document, "primary"),
    save: createPageButton(document),
    forget: createPageButton(document),
    refresh: createPageButton(document, "text"),
  };
  for (const [operation, button] of Object.entries(buttons)) {
    button.dataset.action = operation;
    button.textContent = {
      open: "Open saved layout in a new window",
      save: "Save this window",
      forget: "Forget saved layout",
      refresh: "Refresh",
    }[operation]!;
    actions.append(button);
  }
  const explanation = document.createElement("section");
  explanation.className = "layout-explanation ui-hint";
  const explanationHeading = document.createElement("h2");
  explanationHeading.textContent = "A snapshot, not a running session";
  explanation.append(explanationHeading);
  for (const text of [
    "Save records available local folder paths. Reported folders are the last local OSC 7 reports; launch-only folders are starting locations, not proof of the shell's current directory. Unknown, ended and known SSH or explicit-command panes start at Home. No terminal output, commands, SSH connections or running processes are saved or replayed.",
    "Open uses this displayed snapshot, not a live layout. Missing or unavailable folders fall back to Home. OS-mounted folders may access their mounts. Your Default Shell runs its normal startup files and may change folders. The new window reports initialization, folder fallbacks and partial failures; acceptance is not proof that every shell started.",
    "Nothing saves or opens automatically. Saved data is retained when this extension is disabled, updated or uninstalled. Use Forget before uninstalling if you do not want to keep the active snapshot.",
    "Forget removes the active snapshot, not every disk copy. Interrupted writes may leave private state-*.tmp files beside state.json in the application profile's extension-state/omxterm.restoration directory. With all OMXTerm instances closed, you may deliberately remove those temporary files. Do not delete state.lock while an app instance runs. Forget is not forensic erasure.",
  ]) {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    explanation.append(paragraph);
  }
  content.append(introduction, summary, actions, explanation);
  const page = createApplicationPage(document, { title, notice, content });
  document.body.append(page);
  const render = (state?: StateDocument) => {
    summary.replaceChildren();
    const heading = document.createElement("h2");
    const detail = document.createElement("p");
    if (!state) {
      heading.textContent = "No snapshot loaded";
      detail.textContent = "Refresh reads saved state without changing it.";
    } else if (state.status !== "saved" || !state.value) {
      heading.textContent =
        state.status === "invalid"
          ? "Saved data is not a valid layout"
          : "No saved layout";
      detail.textContent =
        state.status === "invalid"
          ? "The current revision is readable and has been preserved. Explicitly replace it with this window, or Forget it."
          : "Arrange your terminal tabs and panes, then choose Save this window.";
    } else {
      const saved = state.value;
      const panes = saved.tabs.flatMap((tab) => tab.panes);
      heading.textContent = `${saved.tabs.length} terminal tabs · ${panes.length} panes`;
      detail.textContent = `Saved ${new Date(saved.savedAt).toLocaleString()} · ${saved.platform}. ${saved.omitted} graphical tabs omitted. Folders: ${panes.filter((pane) => pane.kind === "reported-local").length} reported, ${panes.filter((pane) => pane.kind === "launch-local").length} launch-only, ${panes.filter((pane) => pane.kind === "home").length} Home. This is the saved snapshot, not the current window.`;
    }
    summary.append(heading, detail);
    buttons.save.textContent =
      state && state.status !== "empty"
        ? "Replace saved layout"
        : "Save this window";
  };
  render();
  return {
    page,
    buttons,
    render,
    message(text: string, severity: NoticeSeverity = "info") {
      setPageNotice(notice, { text, severity });
    },
  };
}
