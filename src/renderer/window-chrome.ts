import type { TerminalBridge } from "../shared/terminal-bridge";
import type { WindowChromeState } from "../shared/window-chrome";
import { englishLanguage, type RendererLanguage } from "./renderer-language";

export type WindowChromeBridge = Pick<
  TerminalBridge,
  "windowChrome" | "onWindowChrome" | "onTitleBarToggle"
>;

export function mountWindowChrome(
  document: Document,
  bridge: WindowChromeBridge,
  focusTerminal: () => void,
  language: RendererLanguage = englishLanguage,
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
  const button = (
    glyph: string,
    command: "minimize" | "maximize" | "close",
  ) => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = glyph;
    // Native-style pointer controls must not steal terminal or preview focus.
    element.addEventListener("mousedown", (event) => event.preventDefault());
    element.addEventListener("click", () => {
      if (!disposed) bridge.windowChrome(command);
    });
    controls.append(element);
    return element;
  };
  const minimize = button("−", "minimize");
  const maximize = button("□", "maximize");
  const close = button("×", "close");
  const unbindLabels = language.bind((t) => {
    controls.setAttribute("aria-label", t("chrome.windowControls"));
    minimize.setAttribute("aria-label", t("chrome.minimize"));
    maximize.setAttribute(
      "aria-label",
      t(current?.maximized ? "chrome.restore" : "chrome.maximize"),
    );
    close.setAttribute("aria-label", t("chrome.closeWindow"));
  });
  row.append(title, controls);
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
    title.textContent = state.title;
    maximize.textContent = state.maximized ? "❐" : "□";
    maximize.setAttribute(
      "aria-label",
      language.t(state.maximized ? "chrome.restore" : "chrome.maximize"),
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
      unbindLabels();
      removeToggle();
      removeState();
      row.remove();
      handle.remove();
      document.body.classList.remove("window-preview-active");
    },
  };
}
