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
  // Activity is logical panel selection, not transient native visibility.
  const subscription = (channel, valid, initial, replay) => {
    let current = initial;
    const subscribers = new Set();
    const deliver = (listener, value) => {
      try {
        listener(value);
      } catch {
        /* Isolate package listeners. */
      }
    };
    ipcRenderer.on(channel, (_event, value) => {
      if (!valid(value)) return;
      current = value;
      for (const listener of subscribers) deliver(listener, value);
    });
    return (listener) => {
      if (typeof listener !== "function" || subscribers.size >= 32)
        throw new TypeError("Invalid hosted subscription");
      subscribers.add(listener);
      if (replay) deliver(listener, current);
      return () => subscribers.delete(listener);
    };
  };
  const onActivity = subscription(
    "extension-view:activity",
    (value) => typeof value === "boolean",
    false,
    true,
  );
  const onLanguage = subscription(
    "extension-view:language",
    (value) => value === "en-US" || value === "pt-BR",
    "en-US",
    true,
  );
  const onFocusIntent = subscription(
    "extension-view:focus-intent",
    (value) => value === "search" || value === "restore",
    undefined,
    false,
  );
  let pending = 0;
  contextBridge.exposeInMainWorld("omxHostedContent", {
    onActivity,
    onLanguage,
    onFocusIntent,
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
