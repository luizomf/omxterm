import {
  ASSISTANT_PROVIDERS,
  assistantModel,
  type AssistantMessage,
  type AssistantState,
} from "../../shared/assistant";
import type { Translator } from "../../shared/i18n";
import type { AssistantBridge } from "../../shared/terminal-bridge";
import { checkbox } from "../ui/form";
import { icon } from "../ui/icons";
import { confirmAction } from "../ui/modal";

export interface AssistantPanelOptions {
  readonly translator: Translator;
  readonly bridge: AssistantBridge;
  readonly notify: (message: string) => void;
  // Types into the focused pane; submit also presses Enter.
  readonly typeInTerminal: (text: string, submit: boolean) => void;
  readonly copyText: (text: string) => void;
  readonly selection: () => string;
  readonly openPreferences: () => void;
}

export interface AssistantPanel {
  readonly element: HTMLElement;
  activate(): void;
  dispose(): void;
}

// Text and fenced code blocks, rendered as DOM text: an answer can never
// inject markup or run anything by itself.
function renderAnswer(
  document: Document,
  text: string,
  commandActions: (command: string) => HTMLElement,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const parts = text.split(/```[^\n`]*\n?/u);
  parts.forEach((part, index) => {
    if (index % 2 === 1) {
      const block = document.createElement("div");
      block.className = "assistant-code";
      const code = document.createElement("pre");
      code.textContent = part.replace(/\n$/u, "");
      block.append(code);
      // An unfinished block (still streaming) gets its buttons when it ends.
      if (index < parts.length - 1 && part.trim())
        block.append(commandActions(part.trim()));
      fragment.append(block);
    } else if (part.trim()) {
      const paragraph = document.createElement("p");
      paragraph.textContent = part.trim();
      fragment.append(paragraph);
    }
  });
  return fragment;
}

// AshyTerm's optional AI assistant as a sidebar panel. It sends only what
// the user types (and, when asked, the terminal selection) after Send, and
// never runs a suggested command without confirmation.
export function createAssistantPanel(
  document: Document,
  options: AssistantPanelOptions,
): AssistantPanel {
  const { translator, bridge } = options;
  const t = translator.t.bind(translator);
  let state: AssistantState | undefined;
  let messages: AssistantMessage[] = [];
  let active: { id: string; text: string; bubble: HTMLElement } | undefined;
  let disposed = false;

  const element = document.createElement("section");
  element.className = "assistant-panel";
  element.setAttribute("aria-label", t("sidebar.assistant"));
  const off = document.createElement("div");
  off.className = "assistant-off";
  const offText = document.createElement("p");
  offText.textContent = t("assistant.disabled");
  const enable = document.createElement("button");
  enable.type = "button";
  enable.className = "omx-button omx-button-primary";
  enable.textContent = t("assistant.enable");
  enable.addEventListener("click", () => options.openPreferences());
  off.append(offText, enable);

  const on = document.createElement("div");
  on.className = "assistant-on";
  const notice = document.createElement("p");
  notice.className = "assistant-notice";
  const log = document.createElement("div");
  log.className = "assistant-log";
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");
  const input = document.createElement("textarea");
  input.className = "assistant-input";
  input.rows = 3;
  input.placeholder = t("assistant.placeholder");
  input.setAttribute("aria-label", t("assistant.placeholder"));
  const include = checkbox(document, t("assistant.includeSelection"), false);
  const send = document.createElement("button");
  send.type = "button";
  send.className = "omx-button omx-button-primary assistant-send";
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "omx-button omx-button-default";
  clear.textContent = t("assistant.clear");
  const actions = document.createElement("div");
  actions.className = "assistant-actions";
  actions.append(include.element, clear, send);
  on.append(notice, log, input, actions);
  element.append(off, on);

  const commandActions = (command: string) => {
    const row = document.createElement("div");
    row.className = "assistant-command-actions";
    const button = (label: string, run: () => void) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "omx-button omx-button-default";
      item.textContent = label;
      item.addEventListener("click", run);
      row.append(item);
    };
    button(t("common.insert"), () => options.typeInTerminal(command, false));
    button(t("common.run"), () => {
      void confirmAction(document, {
        title: t("assistant.confirmRun"),
        message: command,
        confirmLabel: t("common.run"),
        cancelLabel: t("common.cancel"),
        danger: true,
      }).then((confirmed) => {
        if (confirmed) options.typeInTerminal(command, true);
      });
    });
    button(t("common.copy"), () => options.copyText(command));
    return row;
  };
  const bubble = (role: "user" | "assistant" | "error", text: string) => {
    const item = document.createElement("div");
    item.className = `assistant-message ${role}`;
    if (role === "assistant")
      item.append(renderAnswer(document, text, commandActions));
    else item.textContent = text;
    log.append(item);
    log.scrollTop = log.scrollHeight;
    return item;
  };
  const renderLog = () => {
    log.replaceChildren();
    for (const message of messages) bubble(message.role, message.content);
  };
  const busy = () => active !== undefined;
  const renderControls = () => {
    send.replaceChildren(
      icon(document, busy() ? "stop" : "send"),
      document.createTextNode(t(busy() ? "assistant.stop" : "assistant.send")),
    );
    clear.disabled = busy() || messages.length === 0;
  };
  const renderState = () => {
    const enabled = state?.settings.enabled ?? false;
    off.hidden = enabled;
    on.hidden = !enabled;
    if (!state) return;
    const provider = state.settings.provider;
    const name = `${ASSISTANT_PROVIDERS[provider].name} · ${assistantModel(state.settings)}`;
    notice.textContent = t(
      provider === "local" ? "assistant.localNotice" : "assistant.remoteNotice",
      { provider: name },
    );
    renderControls();
  };

  const submit = async () => {
    if (busy()) {
      void bridge.cancel(active!.id);
      return;
    }
    let text = input.value.trim();
    if (!text) return;
    if (include.input.checked) {
      const selected = options.selection().trim();
      if (!selected) {
        options.notify(t("assistant.noSelection"));
        return;
      }
      text = `${t("assistant.selectionHeader")}\n\`\`\`\n${selected.slice(0, 20_000)}\n\`\`\`\n\n${text}`;
    }
    input.value = "";
    messages.push({ role: "user", content: text });
    bubble("user", text);
    const id = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    active = { id, text: "", bubble: bubble("assistant", "") };
    renderControls();
    try {
      await bridge.chat(id, messages);
    } catch (cause) {
      finish(String(cause instanceof Error ? cause.message : cause), id);
    }
  };
  const finish = (error: string | undefined, id: string) => {
    if (!active || active.id !== id) return;
    const { text, bubble: answer } = active;
    active = undefined;
    if (text) messages.push({ role: "assistant", content: text });
    else answer.remove();
    if (error) bubble("error", t("assistant.error", { reason: error }));
    // The answer is re-rendered whole so its last code block gets buttons.
    if (text) {
      answer.replaceChildren(renderAnswer(document, text, commandActions));
      void bridge.saveHistory(messages).catch(() => undefined);
    }
    renderControls();
  };

  send.addEventListener("click", () => void submit());
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void submit();
    }
    event.stopPropagation();
  });
  clear.addEventListener("click", () => {
    messages = [];
    renderLog();
    renderControls();
    void bridge.saveHistory([]).catch(() => undefined);
  });

  const removeEvents = bridge.onEvent((event) => {
    if (!active || event.requestId !== active.id) return;
    if (event.type === "delta") {
      active.text += event.text;
      active.bubble.replaceChildren(
        renderAnswer(document, active.text, commandActions),
      );
      log.scrollTop = log.scrollHeight;
    } else
      finish(
        event.type === "error" ? event.message : undefined,
        event.requestId,
      );
  });
  const removeChanged = bridge.onChanged((next) => {
    state = next;
    renderState();
  });

  let started = false;
  return {
    element,
    activate() {
      if (!started) {
        started = true;
        void Promise.all([bridge.state(), bridge.history()])
          .then(([current, saved]) => {
            if (disposed) return;
            state = current;
            messages = [...saved];
            renderLog();
            renderState();
          })
          .catch(() => options.notify(t("assistant.unavailable")));
      }
      (state?.settings.enabled ? input : enable).focus();
    },
    dispose() {
      disposed = true;
      if (active) void bridge.cancel(active.id);
      removeEvents();
      removeChanged();
    },
  };
}
