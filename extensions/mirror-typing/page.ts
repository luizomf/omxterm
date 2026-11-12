import {
  createApplicationPage,
  createPageButton,
  setPageNotice,
} from "../../src/renderer/application-page.js";
import type { SupportedLanguage } from "../../src/shared/i18n.js";
import {
  mountHostedAppearance,
  type AppearanceBridge,
} from "../shared/appearance.js";
import { mirrorMessages, type MirrorNotice } from "./messages.js";

const operation = "terminal.mirrorTyping.v1";
export interface MirrorTypingBridge extends AppearanceBridge {
  onLanguage(listener: (language: SupportedLanguage) => void): () => void;
  request(value: unknown): Promise<unknown>;
  onVisibility(listener: (visible: boolean) => void): () => void;
  // Tells the host dialog how tall the content is, so it can fit.
  reportContentHeight?(height: number): void;
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

// Setup only: core owns the input route, the pane marks that stop it and
// every stop condition. This view picks panes and asks for one deliberate
// Start. The host shows it as a dialog and draws its title and Close.
export function mountMirrorTypingPage(
  document: Document,
  bridge: MirrorTypingBridge,
) {
  const unsubscribeAppearance = mountHostedAppearance(document, bridge);
  const window = document.defaultView!;
  const lifetime = new window.AbortController();
  const events = { signal: lifetime.signal };
  const hint = document.createElement("p");
  hint.className = "ui-hint";
  const hintText = document.createTextNode("");
  const learnMore = document.createElement("button");
  learnMore.type = "button";
  learnMore.className = "ui-link";
  learnMore.hidden = true;
  learnMore.addEventListener(
    "click",
    () => {
      void bridge
        .request({ operation: "links.open.v1", link: "docs" })
        .catch(() => {});
    },
    events,
  );
  hint.append(hintText, " ", learnMore);
  const notice = document.createElement("div");
  notice.hidden = true;
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  const targets = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.className = "ui-meta";
  const list = document.createElement("div");
  list.className = "mirror-targets ui-list";
  targets.append(legend, list);
  targets.hidden = true;
  const actions = document.createElement("div");
  actions.className = "mirror-actions ui-actions";
  const start = createPageButton(document, "primary");
  start.dataset.action = "start";
  const refresh = createPageButton(document);
  refresh.dataset.action = "refresh";
  actions.append(start, refresh);
  const content = document.createElement("section");
  content.append(hint, targets, actions);
  const page = createApplicationPage(document, { notice, content });
  document.body.append(page);
  // The page is as tall as its content whatever the dialog allows; the host
  // fits the dialog to it, up to its maximum.
  const ResizeObserverCtor = window.ResizeObserver;
  let reported = -1;
  const heights = ResizeObserverCtor
    ? new ResizeObserverCtor(() => {
        const height = Math.ceil(page.getBoundingClientRect().height);
        if (height === reported) return;
        reported = height;
        bridge.reportContentHeight?.(height);
      })
    : undefined;
  heights?.observe(page);

  let language: SupportedLanguage = "en-US";
  let noticeState:
    { key: MirrorNotice; severity: "warning" | "error" } | undefined;
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
  function relabel() {
    const m = mirrorMessages(language);
    document.documentElement.lang = language;
    hintText.data = m.hint;
    learnMore.textContent = m.learnMore;
    legend.textContent = m.panes;
    start.textContent = m.start;
    refresh.textContent = m.refresh;
    setPageNotice(
      notice,
      noticeState
        ? { text: m[noticeState.key], severity: noticeState.severity }
        : { text: "", severity: "info" },
    );
    setup?.panes.forEach((pane, index) => {
      const label = inputs[index]?.parentElement;
      label
        ?.querySelector(".mirror-pane")
        ?.replaceChildren(m.pane(pane.ordinal, pane.title));
      label?.querySelector(".mirror-current")?.replaceChildren(m.current);
    });
  }
  const message = (
    key: MirrorNotice | undefined,
    severity: "warning" | "error" = "error",
  ) => {
    noticeState = key && { key, severity };
    relabel();
  };
  const selected = () =>
    inputs.filter((input) => input.checked).map((input) => input.value);
  const controls = () => {
    start.disabled =
      pending || !visible || !available || !setup || selected().length < 2;
    refresh.disabled = pending || !visible || !available;
    // Refresh is only the way back to a fresh setup.
    refresh.hidden = pending || !available || !!setup;
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
    try {
      const reply = await bridge.request({ operation, action: "describe" });
      if (disposed || !visible || intent !== generation) return;
      if (!isSetup(reply)) {
        list.replaceChildren();
        inputs = [];
        targets.hidden = true;
        message("noPanes");
        return;
      }
      setup = reply;
      inputs = reply.panes.map((pane) => {
        const label = document.createElement("label");
        label.className = "ui-row";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "page-control";
        input.value = pane.handle;
        input.checked = true;
        const text = document.createElement("span");
        text.className = "mirror-pane";
        label.append(input, text);
        if (pane.required) {
          const current = document.createElement("span");
          current.className = "mirror-current ui-meta";
          label.append(current);
        }
        return input;
      });
      list.replaceChildren(...inputs.map((input) => input.parentElement!));
      targets.hidden = false;
      message(undefined);
    } catch {
      if (!disposed && intent === generation) message("noPanes");
    } finally {
      settle();
      // Enter starts right away; the key that opened this page never reaches
      // Start (see the keydown handler below).
      if (!disposed && intent === generation && !start.disabled) start.focus();
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
      // Core has already returned to the terminal; a fresh visit refreshes.
      if (!active) message("refused");
    } catch {
      if (!disposed && intent === generation) message("unknown", "warning");
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
  // Start fires on key release, and only for a press that began on Start:
  // a press from the palette or a held repeat can't start mirroring, and the
  // release can't leak into a pane after core hides this page.
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
  const unsubscribeLanguage = bridge.onLanguage((next) => {
    language = next;
    relabel();
  });
  const unsubscribeVisibility = bridge.onVisibility((next) => {
    if (disposed || visible === next) return;
    visible = next;
    invalidate();
    if (next && initialized && available) {
      if (pending) refreshOnSettled = true;
      else void describe();
    }
  });
  relabel();
  controls();
  const ready = (async () => {
    let capabilities: unknown[] = [];
    try {
      const reply = await bridge.request({ operation: "host.capabilities" });
      if (
        reply &&
        typeof reply === "object" &&
        "capabilities" in reply &&
        Array.isArray(reply.capabilities)
      )
        capabilities = reply.capabilities;
    } catch {
      // Treated as unavailable below.
    }
    if (disposed) return;
    available = capabilities.includes(operation);
    learnMore.hidden = !capabilities.includes("links.open.v1");
    initialized = true;
    controls();
    if (available) await describe();
    else message("unavailable");
  })();
  return {
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidate();
      unsubscribeLanguage();
      unsubscribeVisibility();
      unsubscribeAppearance();
      lifetime.abort();
      heights?.disconnect();
      page.remove();
    },
  };
}
