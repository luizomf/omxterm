import {
  createApplicationPage,
  createPageButton,
  setPageNotice,
} from "../../src/renderer/application-page.js";
import { parseSshTarget, type SshTarget } from "../../src/shared/ssh-target.js";
import type { AliasIndex } from "./discovery.js";

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
  subtitle.textContent = "OpenSSH connections";
  title.append(heading, subtitle);
  const notice = document.createElement("div");
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  const content = document.createElement("section");
  const quickSection = document.createElement("section");
  const quickLabel = document.createElement("label");
  quickLabel.textContent = "Quick connect";
  const quick = document.createElement("input");
  quick.placeholder = "user@host:port or user@[::1]:port";
  quick.maxLength = 384;
  quick.spellcheck = false;
  quickLabel.append(quick);
  const connectButton = createPageButton(document, "primary");
  connectButton.textContent = "Connect";
  quickSection.className = "quick-connect";
  quickSection.append(quickLabel, connectButton);
  const aliasHeading = document.createElement("h2");
  aliasHeading.textContent = "From your SSH config";
  const searchLabel = document.createElement("label");
  searchLabel.textContent = "Search aliases";
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Filter the listed aliases";
  search.spellcheck = false;
  searchLabel.append(search);
  const refresh = createPageButton(document);
  refresh.textContent = "Refresh";
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
  explanation.textContent =
    "Uses your current OpenSSH configuration; configured commands and forwards still apply. OpenSSH handles authentication and may update known_hosts. This incomplete, read-only alias index does not evaluate Match conditions. Use quick connect for omitted aliases. ASCII names only; IPv6 requires brackets and does not support zone identifiers.";
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
  const message = (
    text: string,
    severity: "info" | "success" | "warning" | "error" = "info",
  ) => setPageNotice(notice, { text, severity });
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
    message("Opening terminal…");
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
    if (reply.ok && reply.status === "accepted")
      message(
        "Terminal accepted. Authentication continues in the terminal.",
        "success",
      );
    else if (reply.error === "ssh-not-found")
      message(
        "OpenSSH client not found on the application PATH. Install OpenSSH or start OMXTerm with its directory on PATH.",
        "error",
      );
    else if (reply.error === "outcome-unknown")
      message(
        "A terminal may already have opened; check your tabs. This request will not be retried automatically.",
        "warning",
      );
    else
      message(
        "Unable to open a terminal. The extension or its source window/session may no longer be available.",
        "error",
      );
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
    } catch (error) {
      message(
        error instanceof Error ? error.message : "Invalid target",
        "error",
      );
      return undefined;
    }
  }
  function render() {
    cancelGesture();
    revision++;
    const list = filtered();
    selected = Math.min(selected, Math.max(0, list.length - 1));
    summary.textContent = `${list.length} of ${aliases.length} indexed aliases${aliases.length === 0 ? " — use Quick connect or Refresh" : ""}`;
    rows.replaceChildren();
    const current = revision;
    list.forEach((alias, index) => {
      const row = createPageButton(document);
      row.dataset.alias = alias;
      row.className += " alias-row";
      row.classList.toggle("selected", index === selected);
      row.textContent = alias;
      row.setAttribute("aria-label", `Connect to ${alias}`);
      row.addEventListener("click", () => {
        if (!suppressClick && current === revision)
          void connect({ host: alias });
      });
      rows.append(row);
    });
    controls();
  }
  async function load() {
    if (reading || disposed) return;
    reading = true;
    aliases = [];
    render();
    const current = ++discoveryRevision;
    summary.textContent = "Reading aliases…";
    try {
      const reply = await bridge.request({ operation: "aliases" });
      if (disposed || current !== discoveryRevision) return;
      if (!reply.ok || !Array.isArray(reply.aliases)) {
        warning.textContent =
          "Alias discovery is unavailable or may still be reading. Quick connect remains available; no automatic retry.";
      } else {
        aliases = reply.aliases;
        warning.textContent = reply.incomplete
          ? `Incomplete index — ${Object.entries(reply.reasons ?? {})
              .map(([reason, count]) => `${reason}: ${count}`)
              .join("; ")}. Quick connect accepts omitted aliases.`
          : "";
      }
      render();
    } catch {
      if (!disposed && current === discoveryRevision) {
        warning.textContent =
          "Alias discovery is unavailable or may still be reading. No automatic retry.";
        render();
      }
    } finally {
      reading = false;
      if (!disposed) {
        if (current !== discoveryRevision) {
          warning.textContent =
            "The discovery result was invalidated. Choose Refresh to read again.";
          render();
        }
        controls();
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
  controls();
  const ready = (async () => {
    try {
      const reply = await bridge.request({ operation: "host.capabilities" });
      if (disposed) return;
      available = reply.capabilities?.includes("terminal.openSsh.v1") === true;
      if (!available)
        message(
          "This host does not provide SSH Connect. Install a compatible Linux ARM64 preview host.",
          "warning",
        );
    } catch {
      if (!disposed) message("Host capabilities unavailable.", "error");
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
      lifetime.abort();
      page.remove();
    },
  };
}
