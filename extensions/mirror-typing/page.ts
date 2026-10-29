import {
  createApplicationPage,
  createPageButton,
  setPageNotice,
  type NoticeSeverity,
} from "../../src/renderer/application-page.js";

const operation = "terminal.mirrorTyping.v1";
export interface MirrorTypingBridge {
  request(value: unknown): Promise<unknown>;
  onVisibility(listener: (visible: boolean) => void): () => void;
}
interface Pane {
  handle: string;
  ordinal: number;
  title: string;
  required: boolean;
}
interface Setup {
  ok: true;
  setupToken: string;
  panes: Pane[];
}
function isSetup(value: unknown): value is Setup {
  if (!value || typeof value !== "object") return false;
  const setup = value as Setup;
  return (
    setup.ok === true &&
    typeof setup.setupToken === "string" &&
    setup.setupToken.length > 0 &&
    Array.isArray(setup.panes) &&
    setup.panes.length >= 2 &&
    setup.panes.length <= 16 &&
    setup.panes.every(
      (pane) =>
        pane &&
        typeof pane.handle === "string" &&
        pane.handle.length > 0 &&
        Number.isInteger(pane.ordinal) &&
        pane.ordinal > 0 &&
        typeof pane.title === "string" &&
        typeof pane.required === "boolean",
    ) &&
    new Set(setup.panes.map((pane) => pane.handle)).size ===
      setup.panes.length &&
    setup.panes.filter((pane) => pane.required).length === 1
  );
}

export function mountMirrorTypingPage(
  document: Document,
  bridge: MirrorTypingBridge,
) {
  const window = document.defaultView!;
  const lifetime = new window.AbortController();
  const events = { signal: lifetime.signal };
  const title = document.createElement("h2");
  title.textContent = "Mirror Typing";
  const notice = document.createElement("div");
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  const content = document.createElement("section");
  const introduction = document.createElement("p");
  introduction.textContent =
    "Choose at least two live panes from the original tab. The originally focused pane must stay selected. New panes do not join automatically.";
  const warning = document.createElement("p");
  setPageNotice(warning, {
    text: "Typing is copied exactly. Use matching terminal programs/modes. Paste, snippets and drops stop mirroring and go only to their original pane. Input already sent cannot be undone.",
    severity: "warning",
  });
  const targets = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "Panes to mirror";
  const list = document.createElement("div");
  list.className = "mirror-targets";
  targets.append(legend, list);
  const actions = document.createElement("div");
  actions.className = "mirror-actions";
  const start = createPageButton(document, "primary");
  start.textContent = "Start mirroring";
  start.dataset.action = "start";
  const refresh = createPageButton(document);
  refresh.textContent = "Refresh targets";
  refresh.dataset.action = "refresh";
  actions.append(start, refresh);
  const help = document.createElement("p");
  help.className = "mirror-help";
  help.textContent =
    "Linux ARM64 preview · Nothing is saved. Start returns to the original pane. Use the visible Stop in the terminal to end mirroring without closing programs. Keys follow the source pane's terminal mode; different programs may interpret the same bytes differently.";
  content.append(introduction, warning, targets, actions, help);
  const page = createApplicationPage(document, { title, notice, content });
  document.body.append(page);

  let setup: Setup | undefined;
  let inputs: HTMLInputElement[] = [];
  let pending = false;
  let visible = false;
  let disposed = false;
  let initialized = false;
  let available = false;
  let generation = 0;
  let refreshOnSettled = false;
  let held: string | undefined;
  let suppressClick = false;
  let clickTimer: number | undefined;
  let holdTimer: number | undefined;
  const message = (text: string, severity: NoticeSeverity = "info") =>
    setPageNotice(notice, { text, severity });
  const selected = () =>
    inputs.filter((input) => input.checked).map((input) => input.value);
  const controls = () => {
    start.disabled =
      pending || !visible || !available || !setup || selected().length < 2;
    refresh.disabled = pending || !visible || !available;
    inputs.forEach((input, index) => {
      input.disabled =
        pending || !visible || !setup || !!setup.panes[index]?.required;
    });
  };
  const cancelGesture = () => {
    held = undefined;
    suppressClick = false;
    window.clearTimeout(clickTimer);
    window.clearTimeout(holdTimer);
  };
  const invalidate = () => {
    generation++;
    setup = undefined;
    cancelGesture();
    controls();
  };
  const settle = () => {
    pending = false;
    if (disposed) return;
    controls();
    if (refreshOnSettled && visible) {
      refreshOnSettled = false;
      void describe();
    }
  };
  async function describe() {
    if (disposed || pending || !visible || !available) return;
    refreshOnSettled = false;
    invalidate();
    const intent = generation;
    pending = true;
    controls();
    message("Reading panes from the original tab…");
    try {
      const reply = await bridge.request({ operation, action: "describe" });
      if (disposed || !visible || intent !== generation) return;
      if (!isSetup(reply)) {
        list.replaceChildren();
        inputs = [];
        message(
          "Targets unavailable. Focus a live pane in a tab with at least two live panes, then open Mirror Typing again, or Refresh targets.",
          "error",
        );
        return;
      }
      setup = reply;
      inputs = reply.panes.map((pane) => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "page-control";
        input.value = pane.handle;
        input.checked = true;
        const text = document.createElement("span");
        text.textContent = `Pane ${pane.ordinal} · ${pane.title}${pane.required ? " · Original focus (required)" : ""}`;
        label.append(input, text);
        return input;
      });
      list.replaceChildren(...inputs.map((input) => input.parentElement!));
      message("Choose your targets, then Start mirroring.");
    } catch {
      if (!disposed && intent === generation)
        message(
          "Targets unavailable. Choose Refresh targets to try again.",
          "error",
        );
    } finally {
      settle();
    }
  }
  async function begin() {
    if (disposed || start.disabled || !setup) return;
    const request = {
      operation,
      action: "start",
      setupToken: setup.setupToken,
      handles: selected(),
    };
    // Start consumes authority even when its reply is lost. Never replay it.
    setup = undefined;
    const intent = generation;
    pending = true;
    controls();
    message("Starting mirroring…");
    try {
      const reply = await bridge.request(request);
      if (disposed || intent !== generation) return;
      const active =
        reply &&
        typeof reply === "object" &&
        "ok" in reply &&
        reply.ok === true &&
        "status" in reply &&
        reply.status === "active";
      message(
        active
          ? "Mirroring started. Use the terminal's visible Stop. Refresh targets before starting again."
          : "Start unavailable. Check the terminal's status, then Refresh targets before another Start.",
        active ? "success" : "error",
      );
    } catch {
      if (!disposed && intent === generation)
        message(
          "Start result unavailable. Check the terminal's status and visible Stop; Refresh targets before another Start.",
          "warning",
        );
    } finally {
      settle();
    }
  }
  list.addEventListener(
    "change",
    () => {
      inputs.forEach((input, index) => {
        if (setup?.panes[index]?.required) input.checked = true;
      });
      cancelGesture();
      controls();
    },
    events,
  );
  start.addEventListener(
    "click",
    () => {
      if (!suppressClick) void begin();
    },
    events,
  );
  // Consume both button activation keys before native hiding can transfer focus.
  start.addEventListener(
    "keydown",
    (event) => {
      if (!["Enter", " "].includes(event.key) || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || held || start.disabled) return;
      held = event.key;
      suppressClick = true;
      holdTimer = window.setTimeout(cancelGesture, 30_000);
    },
    events,
  );
  document.addEventListener(
    "keyup",
    (event) => {
      if (event.key !== held) return;
      event.preventDefault();
      event.stopPropagation();
      cancelGesture();
      suppressClick = true;
      clickTimer = window.setTimeout(() => {
        suppressClick = false;
      }, 0);
      void begin();
    },
    { ...events, capture: true },
  );
  start.addEventListener("blur", cancelGesture, events);
  window.addEventListener("blur", cancelGesture, events);
  refresh.addEventListener(
    "click",
    () => {
      void describe();
    },
    events,
  );
  const unsubscribe = bridge.onVisibility((next) => {
    if (disposed || visible === next) return;
    visible = next;
    invalidate();
    if (next && initialized && available) {
      if (pending) refreshOnSettled = true;
      else void describe();
    }
  });
  controls();
  const ready = (async () => {
    try {
      const reply = await bridge.request({ operation: "host.capabilities" });
      available =
        !!reply &&
        typeof reply === "object" &&
        "capabilities" in reply &&
        Array.isArray(reply.capabilities) &&
        reply.capabilities.includes(operation);
    } catch {
      available = false;
    }
    if (disposed) return;
    initialized = true;
    controls();
    if (available) await describe();
    else
      message(
        "Mirror Typing requires a compatible Linux ARM64 preview host.",
        "error",
      );
  })();
  return {
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidate();
      unsubscribe();
      lifetime.abort();
      page.remove();
    },
  };
}
