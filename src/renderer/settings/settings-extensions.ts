import { renderExtensionCatalog } from "./settings-extension-catalog";
import type {
  CatalogSnapshot,
  ExtensionEntry,
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

const TRUST_DOCS =
  "https://github.com/luizomf/omxterm/blob/main/docs/extension-distribution.md#trust";

// Main reports these codes; anything else reads as an unknown outcome.
const errorCodes = [
  "busy",
  "invalid-package",
  "incompatible",
  "invalid-store",
  "conflict",
  "outcome-unknown",
  "runtime-unavailable",
  "unsupported",
  "invalid-url",
  "download-failed",
  "download-limit",
  "download-timeout",
  "cancelled",
  "invalid-catalog",
  "catalog-mismatch",
  "catalog-selection",
] as const;
// Errors after which the page may be out of date; they offer Refresh.
const recheck = new Set([
  "busy",
  "conflict",
  "invalid-store",
  "outcome-unknown",
  "runtime-unavailable",
]);

// Explicit snapshots, never polling. Relabel retained nodes without repeating a
// request, losing a displayed generation or changing a pending operation.
// eslint-disable-next-line max-lines-per-function -- one page owner keeps busy state, rows and the catalog in step
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
  const reason = (code: string | undefined) =>
    t(
      `extensions.${errorCodes.find((word) => word === code) ?? "outcome-unknown"}`,
    );
  const panel = document.createElement("section");
  panel.className = "settings-panel extensions-panel";
  const heading = document.createElement("h2");
  // The nav already names the page; keep the heading for assistive tech.
  heading.className = "ui-visually-hidden";
  bind(heading, () => t("extensions.heading"));
  // One plain trust sentence; the details live in the docs.
  const explanation = document.createElement("p");
  explanation.className = "ui-hint";
  const trust = document.createElement("span");
  bind(trust, () => `${t("extensions.explanation")} `);
  explanation.append(trust);
  const terminal = document.defaultView?.omxterm?.terminal;
  if (terminal) {
    const learnMore = document.createElement("button");
    learnMore.type = "button";
    learnMore.className = "ui-link";
    bind(learnMore, () => t("extensions.learnMore"));
    learnMore.addEventListener("click", () =>
      terminal.openExternalLink(TRUST_DOCS),
    );
    explanation.append(learnMore);
  }

  // Operation status: one notice, plus Cancel while downloading and Refresh
  // after an error that may leave the page out of date.
  const status = document.createElement("div");
  status.className = "extensions-status";
  const notice = document.createElement("div");
  notice.setAttribute("role", "status");
  const statusActions = document.createElement("div");
  statusActions.className = "ui-actions";
  const cancel = createPageButton(document);
  cancel.classList.add("page-button-compact");
  bind(cancel, () => t("common.cancel"));
  cancel.hidden = true;
  const refresh = createPageButton(document);
  refresh.classList.add("page-button-compact");
  refresh.dataset.action = "refresh";
  bind(refresh, () => t("extensions.refresh"));
  refresh.hidden = true;
  statusActions.append(cancel, refresh);
  status.append(notice, statusActions);

  const installed = document.createElement("section");
  installed.className = "extensions-installed";
  const installedHeading = document.createElement("h3");
  bind(installedHeading, () => t("extensions.installedHeading"));
  const list = document.createElement("div");
  list.className = "extension-installed-list ui-list";
  const empty = document.createElement("p");
  empty.className = "ui-meta";
  bind(empty, () => t("extensions.empty"));
  empty.hidden = true;
  installed.append(installedHeading, list, empty);

  // Other ways to install stay one quiet line; the link field opens on demand.
  const more = document.createElement("div");
  more.className = "ui-actions";
  const fileButton = createPageButton(document, "text");
  fileButton.classList.add("page-button-compact");
  fileButton.dataset.action = "install-file";
  bind(fileButton, () => t("extensions.install"));
  const linkToggle = createPageButton(document, "text");
  linkToggle.classList.add("page-button-compact");
  linkToggle.dataset.action = "install-link";
  linkToggle.setAttribute("aria-expanded", "false");
  bind(linkToggle, () => t("extensions.installLink"));
  more.append(fileButton, linkToggle);
  const linkForm = document.createElement("div");
  linkForm.className = "extensions-link";
  linkForm.hidden = true;
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
  const linkActions = document.createElement("div");
  linkActions.className = "ui-actions";
  const link = createPageButton(document);
  link.classList.add("page-button-compact");
  link.dataset.action = "install-link-submit";
  bind(link, () => t("extensions.catalogInstall"));
  linkActions.append(link);
  linkForm.append(urlLabel, linkActions);
  linkToggle.addEventListener("click", () => {
    linkForm.hidden = !linkForm.hidden;
    linkToggle.setAttribute("aria-expanded", String(!linkForm.hidden));
    if (!linkForm.hidden) url.focus();
  });

  let busy = false;
  let token: string | undefined;
  let last: ExtensionsResult | undefined;
  let entries: ExtensionEntry[] = [];
  let catalogSnapshot: CatalogSnapshot | undefined;
  const controls = new Set<HTMLButtonElement>([
    fileButton,
    linkToggle,
    link,
    refresh,
  ]);
  const rowButtons = new Set<HTMLButtonElement>();
  function setBusy(value: boolean) {
    busy = value;
    panel.setAttribute("aria-busy", String(value));
    url.disabled = value;
    for (const element of [...controls, ...rowButtons])
      element.disabled = value;
  }
  function renderNotice() {
    // Success is quiet; only downloads and problems speak up.
    const error =
      !token && last && !last.ok ? (last.error ?? "outcome-unknown") : "";
    setPageNotice(notice, {
      text: token ? t("extensions.downloading") : error ? reason(error) : "",
      severity: token || error === "cancelled" ? "info" : "warning",
    });
    cancel.hidden = !token;
    refresh.hidden = !recheck.has(error);
    statusActions.hidden = cancel.hidden && refresh.hidden;
    status.hidden = notice.hidden;
  }
  // Plain states only when they aren't the normal one.
  function rowState(entry: ExtensionEntry) {
    const states: string[] = [];
    if (!entry.enabled) states.push(t("extensions.off"));
    if (
      catalogSnapshot?.entries.some(
        (card) =>
          card.id === entry.id && card.action === "update" && card.compatible,
      )
    )
      states.push(t("extensions.updateAvailable"));
    return states.join(" · ");
  }
  function rowButton(
    label: MessageKey,
    request: Extract<ExtensionsRequest, { id: string }>,
    parent: HTMLElement,
  ) {
    const element = createPageButton(document, "text");
    element.classList.add("page-button-compact");
    element.dataset.action = request.operation;
    bind(element, () => t(label));
    element.disabled = busy;
    element.addEventListener("click", () => {
      void run(request);
    });
    rowButtons.add(element);
    parent.append(element);
  }
  function renderRows() {
    for (const element of bindings.keys())
      if (list.contains(element)) bindings.delete(element);
    rowButtons.clear();
    list.replaceChildren();
    // Uninstalled extensions leave the list; the catalog installs them again.
    for (const entry of entries.filter((item) => item.installed)) {
      const row = document.createElement("div");
      row.className = "extension-row ui-row";
      row.dataset.extensionId = entry.id;
      const name = document.createElement("span");
      name.className = "extension-row-name";
      name.textContent = entry.name;
      name.title = entry.id;
      const version = document.createElement("span");
      version.className = "ui-meta";
      version.textContent = entry.version ?? "";
      const state = document.createElement("span");
      state.className = "ui-meta";
      bind(state, () => rowState(entry));
      const actions = document.createElement("div");
      actions.className = "ui-actions ui-actions-dense extension-row-actions";
      rowButton(
        entry.enabled ? "extensions.disable" : "extensions.enable",
        {
          operation: entry.enabled ? "disable" : "enable",
          id: entry.id,
          generation: entry.generation,
        },
        actions,
      );
      rowButton(
        "extensions.uninstall",
        { operation: "uninstall", id: entry.id, generation: entry.generation },
        actions,
      );
      row.append(name, version, state, actions);
      list.append(row);
    }
    empty.hidden = list.children.length > 0;
  }
  function render(result: ExtensionsResult) {
    last = result;
    if (result.catalog) catalog.update(result.catalog);
    renderNotice();
    if (!result.ok) return;
    entries = result.entries ?? [];
    renderRows();
  }
  async function run(request: ExtensionsRequest) {
    if (busy || !live()) return;
    if (request.operation === "install-link" && !request.url) {
      render({ ok: false, error: "invalid-url" });
      return;
    }
    token =
      request.operation === "install-link" ||
      request.operation === "catalog-install"
        ? request.token
        : undefined;
    setBusy(true);
    catalog.busy(true);
    renderNotice();
    try {
      const result = await bridge.request(request);
      token = undefined;
      if (live()) render(result);
    } catch {
      token = undefined;
      if (live()) render({ ok: false, error: "outcome-unknown" });
    } finally {
      setBusy(false);
      catalog.busy(false);
    }
  }
  const cancelDownload = () => {
    if (token)
      void bridge
        .request({ operation: "cancel-install", token })
        .catch(() => {});
  };
  cancel.addEventListener("click", cancelDownload);
  disposers.push(cancelDownload);
  fileButton.addEventListener(
    "click",
    () => void run({ operation: "install" }),
  );
  refresh.addEventListener("click", () => void run({ operation: "snapshot" }));
  link.addEventListener("click", () => {
    if (!busy)
      void run({
        operation: "install-link",
        url: url.value.trim(),
        token: crypto.randomUUID(),
      });
  });
  labels.push((next) => {
    t = next;
    for (const apply of bindings.values()) apply();
    renderNotice();
  });
  const catalog = renderExtensionCatalog(
    document,
    bridge,
    live,
    {
      install: (request) => {
        void run(request);
      },
      changed: (next) => {
        catalogSnapshot = next;
        for (const [element, apply] of bindings)
          if (list.contains(element)) apply();
      },
    },
    labels,
    disposers,
  );
  panel.append(
    heading,
    explanation,
    status,
    installed,
    catalog.element,
    more,
    linkForm,
  );
  void run({ operation: "snapshot" });
  return panel;
}
