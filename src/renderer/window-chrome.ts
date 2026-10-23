import type { TerminalBridge } from "../shared/terminal-bridge";
import type { WindowChromeState } from "../shared/window-chrome";
import type { HeaderToolbar } from "./header-toolbar";

export type WindowChromeBridge = Pick<
  TerminalBridge,
  "windowChrome" | "onWindowChrome" | "onTitleBarToggle"
>;

export function mountWindowChrome(
  document: Document,
  bridge: WindowChromeBridge,
  focusTerminal: () => void,
  toolbar?: HeaderToolbar,
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
  controls.setAttribute("aria-label", "Window controls");
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
  button("Minimize", "−", "minimize");
  const maximize = button("Maximize", "□", "maximize");
  button("Close Window", "×", "close");
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
    const visible = state.titleBarVisible && !state.fullScreen;
    document.documentElement.style.setProperty(
      "--native-title-inset",
      visible && state.style === "native" ? "30px" : "0px",
    );
    row.hidden = !visible || state.style === "native";
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
      state.maximized ? "Restore" : "Maximize",
    );
    handle.hidden =
      state.titleBarVisible ||
      state.fullScreen ||
      previewActive ||
      !state.handleVisible;
    if (toggled && !previewActive) focusTerminal();
  };
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
      row.remove();
      overlay.remove();
      handle.remove();
      document.body.classList.remove("window-preview-active");
    },
  };
}
