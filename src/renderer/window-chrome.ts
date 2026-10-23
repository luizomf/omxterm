import type { TerminalBridge } from "../shared/terminal-bridge";
import type { WindowChromeState } from "../shared/window-chrome";
import type { HeaderToolbar } from "./header-toolbar";
import type { TerminalRendererConfiguration } from "../shared/user-configuration";

// How long a revealed auto-hiding title bar stays after the pointer leaves.
const AUTO_HIDE_DELAY_MS = 2_000;
// The strip along the top edge that reveals it. The outermost pixels of a
// frameless window belong to its resize border and never see the pointer.
const REVEAL_EDGE_PX = 12;

// The window frame settings the page applies itself: rounded corners (a CSS
// clip of the transparent window) and whether the title bar auto-hides.
export function applyWindowFrame(
  document: Document,
  configuration: Pick<
    TerminalRendererConfiguration,
    "cornerRadius" | "autoHideTitleBar" | "filePreview"
  >,
): void {
  const root = document.documentElement;
  root.style.setProperty(
    "--window-radius",
    `${configuration.cornerRadius ?? 0}px`,
  );
  root.toggleAttribute(
    "data-title-bar-autohide",
    configuration.autoHideTitleBar === true,
  );
  // Read by the terminal's file hover preview.
  root.toggleAttribute(
    "data-file-preview-off",
    configuration.filePreview === false,
  );
}

export type WindowChromeBridge = Pick<
  TerminalBridge,
  "windowChrome" | "onWindowChrome" | "onTitleBarToggle"
>;

export interface WindowChromeLabels {
  readonly controls: string;
  readonly minimize: string;
  readonly maximize: string;
  readonly restore: string;
  readonly close: string;
}

const ENGLISH_CHROME_LABELS: WindowChromeLabels = {
  controls: "Window controls",
  minimize: "Minimize",
  maximize: "Maximize",
  restore: "Restore",
  close: "Close Window",
};

export function mountWindowChrome(
  document: Document,
  bridge: WindowChromeBridge,
  focusTerminal: () => void,
  toolbar?: HeaderToolbar,
  labels: WindowChromeLabels = ENGLISH_CHROME_LABELS,
) {
  let disposed = false;
  let previewActive = false;
  let current: WindowChromeState | undefined;
  const row = document.createElement("header");
  row.className = "window-title-bar";
  row.hidden = true;
  const title = document.createElement("span");
  title.className = "window-title";
  const controls = document.createElement("nav");
  controls.setAttribute("aria-label", labels.controls);
  const button = (
    label: string,
    glyph: string,
    command: "minimize" | "maximize" | "close",
  ) => {
    const element = document.createElement("button");
    element.type = "button";
    element.setAttribute("aria-label", label);
    element.textContent = glyph;
    // Native-style pointer controls must not steal terminal or preview focus.
    element.addEventListener("mousedown", (event) => event.preventDefault());
    element.addEventListener("click", () => {
      if (!disposed) bridge.windowChrome(command);
    });
    controls.append(element);
    return element;
  };
  button(labels.minimize, "−", "minimize");
  const maximize = button(labels.maximize, "□", "maximize");
  button(labels.close, "×", "close");
  row.append(title, controls);
  // The header toolbar shares the custom title bar; with native controls
  // (macOS) it overlays the title inset beside the traffic lights.
  const overlay = document.createElement("header");
  overlay.className = "window-toolbar-overlay";
  overlay.hidden = true;
  if (toolbar) {
    row.classList.add("with-toolbar");
    row.insertBefore(toolbar.leading, title);
    row.insertBefore(toolbar.trailing, controls);
  }
  const handle = document.createElement("div");
  handle.className = "window-drag-handle";
  handle.setAttribute("aria-hidden", "true");
  handle.hidden = true;
  handle.append(
    ...Array.from({ length: 3 }, () => document.createElement("i")),
  );
  document.body.prepend(row);
  // Later no-drag regions subtract earlier drag regions regardless of z-index.
  // Keep the fixed handle after the overlapping tab strip in layout order.
  document.body.append(handle);
  const render = (state: WindowChromeState) => {
    if (disposed) return;
    const toggled =
      current !== undefined &&
      state.titleBarVisible !== current.titleBarVisible;
    current = state;
    // An auto-hiding bar stays available in full screen, where it is the
    // only way to reach the toolbar with the pointer.
    const autoHide =
      document.documentElement.hasAttribute("data-title-bar-autohide") &&
      state.style === "custom";
    const visible = state.titleBarVisible && (!state.fullScreen || autoHide);
    document.documentElement.style.setProperty(
      "--native-title-inset",
      visible && state.style === "native" ? "30px" : "0px",
    );
    row.hidden = !visible || state.style === "native";
    // Square corners where the window fills the screen.
    document.body.classList.toggle(
      "window-filled",
      state.maximized || state.fullScreen,
    );
    if (toolbar) {
      const native = visible && state.style === "native";
      if (native && overlay.childElementCount === 0) {
        overlay.append(toolbar.leading, toolbar.trailing);
        document.body.prepend(overlay);
      } else if (!native && overlay.childElementCount > 0) {
        row.insertBefore(toolbar.leading, title);
        row.insertBefore(toolbar.trailing, controls);
      }
      overlay.hidden = !native;
    }
    title.textContent = state.title;
    maximize.textContent = state.maximized ? "❐" : "□";
    maximize.setAttribute(
      "aria-label",
      state.maximized ? labels.restore : labels.maximize,
    );
    handle.hidden =
      state.titleBarVisible ||
      state.fullScreen ||
      previewActive ||
      !state.handleVisible;
    if (toggled && !previewActive) focusTerminal();
  };
  const autoHide = installAutoHide(document, row, () => {
    if (current) render(current);
  });
  const removeState = bridge.onWindowChrome(render);
  const removeToggle = bridge.onTitleBarToggle(() => {
    if (!disposed && !previewActive) bridge.windowChrome("toggle-title-bar");
  });
  return {
    setPreviewActive(active: boolean) {
      if (disposed || previewActive === active) return;
      previewActive = active;
      document.body.classList.toggle("window-preview-active", active);
      if (current) render(current);
      bridge.windowChrome(active ? "preview-active" : "preview-inactive");
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      removeToggle();
      removeState();
      toolbar?.dispose();
      autoHide();
      row.remove();
      overlay.remove();
      handle.remove();
      document.body.classList.remove("window-preview-active");
    },
  };
}

// With data-title-bar-autohide on the root, the custom title bar collapses to
// nothing: the pointer at the top edge (or focus inside it) opens it, pushing
// the tabs and terminal down, and it closes a moment after the pointer
// leaves.
function installAutoHide(
  document: Document,
  row: HTMLElement,
  changed: () => void,
): () => void {
  const view = document.defaultView;
  // Turning the setting on or off re-renders (full screen depends on it).
  const observer = new MutationObserver(() => {
    if (!enabled()) row.classList.remove("revealed");
    changed();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-title-bar-autohide"],
  });
  let timer: number | undefined;
  const enabled = () =>
    document.documentElement.hasAttribute("data-title-bar-autohide");
  const reveal = () => {
    if (!enabled() || row.hidden) return;
    if (timer !== undefined) view?.clearTimeout(timer);
    timer = undefined;
    row.classList.add("revealed");
  };
  const scheduleHide = () => {
    if (!enabled()) return;
    if (timer !== undefined) view?.clearTimeout(timer);
    timer = view?.setTimeout(() => {
      timer = undefined;
      if (!row.matches(":hover") && !row.contains(document.activeElement))
        row.classList.remove("revealed");
    }, AUTO_HIDE_DELAY_MS);
  };
  const onMove = (event: MouseEvent) => {
    if (event.clientY <= REVEAL_EDGE_PX) reveal();
  };
  document.addEventListener("mousemove", onMove, { passive: true });
  row.addEventListener("mouseenter", reveal);
  row.addEventListener("mouseleave", scheduleHide);
  row.addEventListener("focusin", reveal);
  row.addEventListener("focusout", scheduleHide);
  return () => {
    if (timer !== undefined) view?.clearTimeout(timer);
    document.removeEventListener("mousemove", onMove);
    observer.disconnect();
  };
}
