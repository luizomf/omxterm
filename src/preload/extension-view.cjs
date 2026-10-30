// App-owned child preload. Requests reach only this actual view's captured
// backend. No path-to-main filesystem or terminal bridge is exposed.
const { contextBridge, ipcRenderer } = require("electron");

if (process.isMainFrame) {
  let visible = false;
  const listeners = new Set();
  ipcRenderer.on("extension-view:visibility", (_event, value) => {
    if (typeof value !== "boolean") return;
    visible = value;
    for (const listener of listeners) listener(visible);
  });
  let appearance;
  const appearanceListeners = new Set();
  const deliverAppearance = (listener) => {
    try {
      listener(appearance);
    } catch {
      // One extension listener must not suppress later subscribers.
    }
  };
  ipcRenderer.on("extension-view:appearance", (_event, value) => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).length !== 3 ||
      !["background", "foreground", "opacity"].every((key) =>
        Object.hasOwn(value, key),
      ) ||
      typeof value.background !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(value.background) ||
      typeof value.foreground !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(value.foreground) ||
      typeof value.opacity !== "number" ||
      !Number.isFinite(value.opacity) ||
      value.opacity < 0 ||
      value.opacity > 1
    )
      return;
    appearance = Object.freeze({
      background: value.background,
      foreground: value.foreground,
      opacity: value.opacity,
    });
    for (const listener of appearanceListeners) deliverAppearance(listener);
  });
  let pending = 0;
  contextBridge.exposeInMainWorld("omxHostedContent", {
    async request(value) {
      if (pending >= 32) throw new Error("Request capacity exceeded");
      pending++;
      try {
        return await ipcRenderer.invoke("extension-view:request", value);
      } finally {
        pending--;
      }
    },
    onAppearance(listener) {
      if (typeof listener !== "function" || appearanceListeners.size >= 32)
        throw new TypeError("Invalid appearance subscription");
      appearanceListeners.add(listener);
      if (appearance) deliverAppearance(listener);
      return () => appearanceListeners.delete(listener);
    },
    onVisibility(listener) {
      if (typeof listener !== "function" || listeners.size >= 32)
        throw new TypeError("Invalid visibility subscription");
      listeners.add(listener);
      listener(visible);
      return () => listeners.delete(listener);
    },
  });
}
