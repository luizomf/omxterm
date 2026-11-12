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
  const onFilesTerminalDrop = subscription(
    "files-terminal-drag:result",
    (value) =>
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      ["accepted", "refused", "unknown"].includes(value.status) &&
      Object.keys(value).every((key) => key === "status" || key === "reason") &&
      (value.reason === undefined ||
        (typeof value.reason === "string" && value.reason.length <= 64)),
    undefined,
    false,
  );
  // These stamps stay private to the app-owned preload. Package code can
  // neither pick a terminal nor reuse a previous gesture's observation.
  let selectionRevision;
  let admissionGeneration;
  let lastAdmissionGeneration = -1;
  const validRevision = (value) => Number.isSafeInteger(value) && value >= 0;
  ipcRenderer.on("extension-view:action-selection", (_event, value) => {
    if (
      validRevision(value) &&
      (selectionRevision === undefined || value > selectionRevision)
    )
      selectionRevision = value;
  });
  ipcRenderer.on("extension-view:action-admission", (_event, value) => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).sort().join() !== "generation,visible" ||
      !validRevision(value.generation) ||
      typeof value.visible !== "boolean" ||
      value.generation < lastAdmissionGeneration
    )
      return;
    lastAdmissionGeneration = value.generation;
    admissionGeneration = value.visible ? value.generation : undefined;
  });
  let pending = 0;
  contextBridge.exposeInMainWorld("omxHostedContent", {
    onActivity,
    onLanguage,
    onFocusIntent,
    onFilesTerminalDrop,
    // Synchronous, bounded and main-owned: dragstart must finish writing its
    // opaque DataTransfer ticket before Chromium leaves the child view.
    beginFilesTerminalDrag(value) {
      if (
        !visible ||
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).sort().join() !== "entryToken,kind,path" ||
        typeof value.path !== "string" ||
        value.path.length > 32768 ||
        !["file", "directory", "link"].includes(value.kind) ||
        typeof value.entryToken !== "string" ||
        !/^[1-9][0-9]{0,15}$/.test(value.entryToken)
      )
        return null;
      try {
        const ticket = ipcRenderer.sendSync("files-terminal-drag:start", value);
        return typeof ticket === "string" &&
          /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(ticket)
          ? ticket
          : null;
      } catch {
        return null;
      }
    },
    endFilesTerminalDrag(ticket) {
      if (
        typeof ticket === "string" &&
        /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(ticket)
      )
        ipcRenderer.send("files-terminal-drag:end", ticket);
    },
    async request(value) {
      if (pending >= 32) throw new Error("Request capacity exceeded");
      pending++;
      try {
        if (
          value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          value.operation === "terminal.insertPath.v1"
        )
          return await ipcRenderer.invoke("extension-view:request", value, {
            selectionRevision,
            admissionGeneration,
          });
        return await ipcRenderer.invoke("extension-view:request", value);
      } finally {
        pending--;
      }
    },
    // A dialog-presented view tells core how tall its content is, so the
    // dialog can fit it. Core clamps it to the dialog's maximum.
    reportContentHeight(height) {
      if (Number.isInteger(height) && height >= 0 && height <= 10000)
        ipcRenderer.send("extension-view:content-height", height);
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
