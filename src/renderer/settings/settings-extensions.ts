import { renderExtensionCatalog } from "./settings-extension-catalog";
import type {
  ExtensionsBridge,
  ExtensionsRequest,
  ExtensionsResult,
} from "../../shared/extensions";
import type { MessageKey } from "../../shared/i18n";
import { englishLanguage, type Translate } from "../renderer-language";
import { createPageButton, setPageNotice } from "../application-page";

import type { SettingsDestination } from "./settings-dialog";

// Remember explicit Extensions navigation until the Settings snapshot builds pages.
export function extensionsNavigation(
  buttons: HTMLButtonElement[],
  select: (index: number) => void,
  interactive: () => boolean,
) {
  let destination: SettingsDestination | undefined;
  const navigate = (next: SettingsDestination, focus = true) => {
    destination = next;
    const index = buttons.findIndex(
      (button) => button.id === `settings-tab-${next.page}`,
    );
    if (index < 0) return;
    select(index);
    if (focus && interactive()) buttons[index]?.focus();
  };
  return {
    navigate,
    restore: () => {
      if (destination) navigate(destination, false);
    },
  };
}

// Settings keeps contextual guidance separate from operation/runtime status.
export function extensionsPage(...args: Parameters<typeof renderExtensions>) {
  const [document, , , labels] = args;
  const element = renderExtensions(...args);
  const notice = document.createElement("p");
  notice.className = "settings-snippets-notice";
  notice.hidden = true;
  labels?.push((t) => {
    notice.textContent = t("extensions.snippetsOptional");
  });
  element.prepend(notice);
  return {
    element,
    showSnippetsNotice: () => {
      notice.hidden = false;
    },
  };
}

const statusWords = [
  "enabled",
  "disabled",
  "uninstalled",
  "dormant",
  "starting",
  "active",
  "stopping",
  "failed",
  "unknown",
  "busy",
  "invalid-package",
  "incompatible",
  "invalid-store",
  "conflict",
  "outcome-unknown",
  "runtime-unavailable",
  "unsupported",
  "unavailable",
  "invalid-url",
  "download-failed",
  "download-limit",
  "download-timeout",
  "cancelled",
  "invalid-catalog",
  "catalog-mismatch",
  "catalog-selection",
] as const;

// Explicit snapshots, never polling. Relabel retained nodes without repeating a
// request, losing a displayed generation or changing a pending operation.
export function renderExtensions(
  document: Document,
  bridge: ExtensionsBridge,
  live: () => boolean,
  labels: ((t: Translate) => void)[] = [],
  disposers: (() => void)[] = [],
) {
  let t = englishLanguage.t;
  const bindings = new Map<HTMLElement, () => void>();
  function bind(element: HTMLElement, text: () => string) {
    const apply = () => {
      element.textContent = text();
    };
    bindings.set(element, apply);
    apply();
  }
  const term = (value: string) => {
    return t(
      `extensions.${statusWords.find((word) => word === value) ?? "unknown"}`,
    );
  };
  const panel = document.createElement("section");
  panel.className = "settings-panel extensions-panel";
  const heading = document.createElement("h2");
  bind(heading, () => t("extensions.heading"));
  const explanation = document.createElement("p");
  bind(explanation, () => t("extensions.explanation"));
  const controls = document.createElement("div");
  controls.className = "application-page-actions";
  const notice = document.createElement("div");
  notice.setAttribute("role", "status");
  const list = document.createElement("div");
  let busy = false;
  let token: string | undefined;
  const urlLabel = document.createElement("label");
  urlLabel.className = "settings-row";
  const urlText = document.createElement("span");
  bind(urlText, () => t("extensions.url"));
  const url = document.createElement("input");
  url.type = "url";
  url.className = "page-control";
  url.maxLength = 8192;
  url.placeholder = "https://…/extension.omxext";
  url.autocomplete = "off";
  url.spellcheck = false;
  urlLabel.append(urlText, url);
  const link = createPageButton(document);
  bind(link, () => t("extensions.installLink"));
  link.addEventListener("click", () => {
    if (!busy)
      void run({
        operation: "install-link",
        url: url.value.trim(),
        token: crypto.randomUUID(),
      });
  });
  const cancel = createPageButton(document);
  bind(cancel, () => t("common.cancel"));
  cancel.hidden = true;
  const cancelDownload = () => {
    if (token)
      void bridge
        .request({ operation: "cancel-install", token })
        .catch(() => {});
  };
  cancel.addEventListener("click", cancelDownload);
  disposers.push(cancelDownload);
  let last: ExtensionsResult | undefined;
  const buttons = new Set<HTMLButtonElement>();
  function button(
    label: MessageKey,
    request: ExtensionsRequest,
    parent: HTMLElement,
  ) {
    const element = createPageButton(document);
    bind(element, () => t(label));
    element.disabled = busy;
    element.addEventListener("click", () => {
      void run(request);
    });
    buttons.add(element);
    parent.append(element);
  }
  function renderNotice() {
    if (token) {
      setPageNotice(notice, {
        text: t("extensions.downloading"),
        severity: "info",
      });
      return;
    }
    if (!last) return;
    setPageNotice(notice, {
      text: !last.ok
        ? t("extensions.error", {
            reason: term(last.error ?? "outcome-unknown"),
          })
        : (last.pendingCleanup === undefined
            ? t("extensions.cleanupUnchecked")
            : "") +
          t(
            last.pendingCleanup
              ? "extensions.cleanupPending"
              : "extensions.refreshed",
          ),
      severity: !last.ok || last.pendingCleanup ? "warning" : "info",
    });
  }
  function render(result: ExtensionsResult) {
    last = result;
    if (result.catalog) catalog.update(result.catalog);
    renderNotice();
    if (!result.ok) return;
    for (const element of bindings.keys())
      if (element === list || list.contains(element)) bindings.delete(element);
    for (const element of buttons)
      if (list.contains(element)) buttons.delete(element);
    list.replaceChildren();
    for (const entry of result.entries ?? []) {
      const row = document.createElement("section");
      const title = document.createElement("h3");
      title.textContent = `${entry.name}${entry.version ? ` · ${entry.version}` : ""}`;
      const state = document.createElement("p");
      bind(state, () =>
        t("extensions.state", {
          id: entry.id,
          generation: entry.generation,
          installed: term(
            entry.installed
              ? entry.enabled
                ? "enabled"
                : "disabled"
              : "uninstalled",
          ),
          local: term(entry.local),
        }),
      );
      row.append(title, state);
      if (entry.installed) {
        button(
          entry.enabled ? "extensions.disable" : "extensions.enable",
          {
            operation: entry.enabled ? "disable" : "enable",
            id: entry.id,
            generation: entry.generation,
          },
          row,
        );
        button(
          "extensions.uninstall",
          {
            operation: "uninstall",
            id: entry.id,
            generation: entry.generation,
          },
          row,
        );
      }
      list.append(row);
    }
    if (!list.children.length) bind(list, () => t("extensions.empty"));
  }
  async function run(request: ExtensionsRequest) {
    if (busy || !live()) return;
    if (request.operation === "install-link" && !request.url) {
      render({ ok: false, error: "invalid-url" });
      return;
    }
    busy = true;
    token =
      request.operation === "install-link" ||
      request.operation === "catalog-install"
        ? request.token
        : undefined;
    catalog.busy(true);
    cancel.hidden = !token;
    url.disabled = true;
    link.disabled = true;
    renderNotice();
    for (const element of buttons) element.disabled = true;
    try {
      const result = await bridge.request(request);
      token = undefined;
      if (live()) render(result);
    } catch {
      token = undefined;
      if (live()) render({ ok: false, error: "outcome-unknown" });
    } finally {
      busy = false;
      catalog.busy(false);
      cancel.hidden = true;
      url.disabled = false;
      link.disabled = false;
      for (const element of buttons) element.disabled = false;
    }
  }
  labels.push((next) => {
    t = next;
    for (const apply of bindings.values()) apply();
    renderNotice();
  });
  const catalog = renderExtensionCatalog(
    document,
    bridge,
    live,
    (request) => {
      void run(request);
    },
    labels,
    disposers,
  );
  controls.append(link, cancel);
  button("extensions.install", { operation: "install" }, controls);
  button("extensions.refresh", { operation: "snapshot" }, controls);
  panel.append(
    heading,
    explanation,
    catalog.element,
    urlLabel,
    controls,
    notice,
    list,
  );
  void run({ operation: "snapshot" });
  return panel;
}
