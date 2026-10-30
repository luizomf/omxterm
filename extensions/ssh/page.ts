import {
  createApplicationPage,
  createPageButton,
  setPageNotice,
} from "../../src/renderer/application-page.js";
import { parseSshTarget, type SshTarget } from "../../src/shared/ssh-target.js";
import type { AliasIndex } from "./discovery.js";
import type { SupportedLanguage } from "../../src/shared/i18n.js";
import { sshMessages, sshIndexWarning, type SshNotice } from "./messages.js";

type Reply = Partial<AliasIndex> & {
  ok?: boolean;
  error?: string;
  status?: string;
  capabilities?: string[];
};
import {
  mountHostedAppearance,
  type AppearanceBridge,
} from "../shared/appearance.js";

export interface SshBridge extends AppearanceBridge {
  onLanguage(listener: (language: SupportedLanguage) => void): () => void;
  request(value: unknown): Promise<Reply>;
  onVisibility(listener: (visible: boolean) => void): () => void;
}

export function mountSshPage(document: Document, bridge: SshBridge) {
  const unsubscribeAppearance = mountHostedAppearance(document, bridge);
  const window = document.defaultView!;
  const lifetime = new window.AbortController();
  const title = document.createElement("div");
  const heading = document.createElement("h1");
  heading.textContent = "SSH Connect";
  const subtitle = document.createElement("p");
  title.append(heading, subtitle);
  const notice = document.createElement("div");
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  const content = document.createElement("section");
  const quickSection = document.createElement("section");
  const quickLabel = document.createElement("label");
  const quickText = document.createTextNode("");
  quickLabel.append(quickText);
  const quick = document.createElement("input");
  quick.maxLength = 384;
  quick.spellcheck = false;
  quickLabel.append(quick);
  const connectButton = createPageButton(document, "primary");
  quickSection.className = "quick-connect";
  quickSection.append(quickLabel, connectButton);
  const aliasHeading = document.createElement("h2");
  const searchLabel = document.createElement("label");
  const searchText = document.createTextNode("");
  searchLabel.append(searchText);
  const search = document.createElement("input");
  search.type = "search";
  search.spellcheck = false;
  searchLabel.append(search);
  const refresh = createPageButton(document);
  const toolbar = document.createElement("div");
  toolbar.className = "alias-toolbar";
  toolbar.append(searchLabel, refresh);
  const summary = document.createElement("p");
  const rows = document.createElement("div");
  rows.className = "aliases";
  const warning = document.createElement("p");
  warning.className = "index-warning";
  const explanation = document.createElement("p");
  explanation.className = "ssh-explanation";
  content.append(
    quickSection,
    aliasHeading,
    toolbar,
    summary,
    warning,
    rows,
    explanation,
  );
  const page = createApplicationPage(document, { title, notice, content });
  document.body.append(page);
  let aliases: string[] = [];
  let revision = 0;
  let discoveryRevision = 0;
  let selected = 0;
  let reading = false;
  let pending = false;
  let available = false;
  let visible = false;
  let disposed = false;
  let gesture: { target: SshTarget; revision: number } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let suppressClick = false;
  let language: SupportedLanguage = "en-US";
  let noticeState:
    | { key: SshNotice; severity: "info" | "success" | "warning" | "error" }
    | undefined;
  let warningState:
    "discovery" | "invalidated" | AliasIndex["reasons"] | undefined;
  function relabel() {
    const m = sshMessages(language);
    document.documentElement.lang = language;
    subtitle.textContent = m.subtitle;
    quickText.data = m.quick;
    quick.placeholder = m.placeholder;
    connectButton.textContent = m.connect;
    aliasHeading.textContent = m.aliases;
    searchText.data = m.search;
    search.placeholder = m.filter;
    refresh.textContent = m.refresh;
    explanation.textContent = m.explanation;
    summary.textContent = reading
      ? m.reading
      : m.summary(filtered().length, aliases.length);
    warning.textContent =
      typeof warningState === "string"
        ? m[warningState]
        : warningState
          ? sshIndexWarning(warningState, language)
          : "";
    if (noticeState)
      setPageNotice(notice, {
        text: m[noticeState.key],
        severity: noticeState.severity,
      });
    for (const row of rows.querySelectorAll<HTMLButtonElement>("[data-alias]"))
      row.setAttribute("aria-label", m.connectTo(row.dataset.alias!));
  }
  const message = (
    key: SshNotice,
    severity: "info" | "success" | "warning" | "error" = "info",
  ) => {
    noticeState = { key, severity };
    relabel();
  };
  const filtered = () =>
    aliases.filter((alias) =>
      alias.toLowerCase().includes(search.value.toLowerCase()),
    );
  const cancelGesture = () => {
    gesture = undefined;
    suppressClick = false;
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  const controls = () => {
    connectButton.disabled = pending || !available;
    refresh.disabled = reading;
    for (const button of rows.querySelectorAll("button"))
      button.disabled = pending || !available;
  };
  async function connect(target: SshTarget) {
    if (pending || !available || disposed || !visible) return;
    pending = true;
    controls();
    message("opening");
    let reply: Reply;
    try {
      reply = await bridge.request({
        operation: "terminal.openSsh.v1",
        target,
      });
    } catch {
      reply = { ok: false, error: "outcome-unknown" };
    }
    if (disposed) return;
    pending = false;
    controls();
    if (reply.ok && reply.status === "accepted") message("accepted", "success");
    else if (reply.error === "ssh-not-found") message("missing", "error");
    else if (reply.error === "outcome-unknown") message("unknown", "warning");
    else message("failed", "error");
  }
  function targetFor(element: EventTarget | null): SshTarget | undefined {
    if (element === quick || element === connectButton)
      return parseSshTarget(quick.value);
    if (element === search) {
      const alias = filtered()[selected];
      return alias ? { host: alias } : undefined;
    }
    if (element instanceof window.HTMLElement && element.dataset.alias)
      return { host: element.dataset.alias };
    return undefined;
  }
  function capture(element: EventTarget | null) {
    try {
      return targetFor(element);
    } catch {
      message("invalid", "error");
      return undefined;
    }
  }
  function render() {
    cancelGesture();
    revision++;
    const list = filtered();
    selected = Math.min(selected, Math.max(0, list.length - 1));

    rows.replaceChildren();
    const current = revision;
    list.forEach((alias, index) => {
      const row = createPageButton(document);
      row.dataset.alias = alias;
      row.className += " alias-row";
      row.classList.toggle("selected", index === selected);
      row.textContent = alias;
      row.setAttribute("aria-label", sshMessages(language).connectTo(alias));
      row.addEventListener("click", () => {
        if (!suppressClick && current === revision)
          void connect({ host: alias });
      });
      rows.append(row);
    });
    controls();
    relabel();
  }
  async function load() {
    if (reading || disposed) return;
    reading = true;
    aliases = [];
    render();
    const current = ++discoveryRevision;
    relabel();
    try {
      const reply = await bridge.request({ operation: "aliases" });
      if (disposed || current !== discoveryRevision) return;
      if (!reply.ok || !Array.isArray(reply.aliases)) {
        warningState = "discovery";
      } else {
        aliases = reply.aliases;
        warningState = reply.incomplete ? (reply.reasons ?? {}) : undefined;
      }
      render();
    } catch {
      if (!disposed && current === discoveryRevision) {
        warningState = "discovery";
        render();
      }
    } finally {
      reading = false;
      if (!disposed) {
        if (current !== discoveryRevision) {
          warningState = "invalidated";
          render();
        }
        controls();
        relabel();
      }
    }
  }
  connectButton.addEventListener("click", () => {
    if (!suppressClick) {
      const target = capture(quick);
      if (target) void connect(target);
    }
  });
  refresh.addEventListener("click", () => {
    void load();
  });
  search.addEventListener("input", () => {
    selected = 0;
    render();
  });
  quick.addEventListener("input", cancelGesture);
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.target === search &&
        (event.key === "ArrowDown" || event.key === "ArrowUp")
      ) {
        event.preventDefault();
        selected = Math.max(
          0,
          Math.min(
            filtered().length - 1,
            selected + (event.key === "ArrowDown" ? 1 : -1),
          ),
        );
        render();
        return;
      }
      if (event.key !== "Enter" || event.isComposing) return;
      const owned =
        event.target === quick ||
        event.target === search ||
        event.target === connectButton ||
        (event.target instanceof window.HTMLElement &&
          !!event.target.dataset.alias);
      if (!owned) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || gesture || pending || !available || !visible) return;
      const target = capture(event.target);
      if (!target) return;
      suppressClick = true;
      gesture = { target, revision };
      timer = setTimeout(cancelGesture, 30_000);
    },
    { capture: true, signal: lifetime.signal },
  );
  document.addEventListener(
    "keyup",
    (event) => {
      if (event.key !== "Enter" || !suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
      const owned = gesture;
      cancelGesture();
      suppressClick = true;
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);
      if (owned && owned.revision === revision) void connect(owned.target);
    },
    { capture: true, signal: lifetime.signal },
  );
  window.addEventListener("blur", cancelGesture, { signal: lifetime.signal });
  const unsubscribe = bridge.onVisibility((next) => {
    if (next === visible) return;
    visible = next;
    if (!next) {
      cancelGesture();
      revision++;
      discoveryRevision++;
    } else if (!disposed) {
      if (!reading) render();
      search.focus();
    }
  });
  const unsubscribeLanguage = bridge.onLanguage((next) => {
    if (disposed) return;
    language = next;
    relabel();
  });
  relabel();
  controls();
  const ready = (async () => {
    try {
      const reply = await bridge.request({ operation: "host.capabilities" });
      if (disposed) return;
      available = reply.capabilities?.includes("terminal.openSsh.v1") === true;
      if (!available) message("unavailable", "warning");
    } catch {
      if (!disposed) message("capabilities", "error");
    }
    if (!disposed) {
      controls();
      await load();
    }
  })();
  return {
    ready,
    dispose() {
      disposed = true;
      revision++;
      discoveryRevision++;
      cancelGesture();
      unsubscribe();
      unsubscribeAppearance();
      unsubscribeLanguage();
      lifetime.abort();
      page.remove();
    },
  };
}
