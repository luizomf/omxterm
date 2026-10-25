import type { Translator } from "../../shared/i18n";
import {
  parseSshTarget,
  type SavedSessionsDocument,
} from "../../shared/saved-sessions";
import type { SessionsBridge } from "../../shared/terminal-bridge";
import type { PaneLaunch, TerminalLaunchPlacement } from "../terminal-tabs";
import { failure } from "./session-actions";
import {
  favoriteSessions,
  recentSessions,
  visibleSessionTree,
} from "./session-tree";
import { showPanelMenu } from "./sessions-menus";
import {
  applySessionStatus,
  focusRow,
  folderRow,
  handleRowKey,
  sessionRow,
  type RowContext,
} from "./sessions-rows";
import { countSessionPanes, type OpenSessionPane } from "./session-activity";

export interface SessionsPanelOptions {
  readonly translator: Translator;
  readonly bridge: SessionsBridge;
  readonly open: (
    launch: PaneLaunch,
    placement: TerminalLaunchPlacement,
  ) => void;
  readonly notify: (message: string) => void;
  // This window's open panes, for status dots and the open-pane menu.
  readonly openPanes?: {
    list(): readonly OpenSessionPane[];
    reveal(pane: OpenSessionPane): void;
    subscribe(listener: () => void): () => void;
  };
}

export interface SessionsPanel {
  readonly element: HTMLElement;
  activate(): void;
  dispose(): void;
}

// The Sessions sidebar panel: Quick Connect, search, favorites, recents and
// the folder tree. Saved definitions come from main; nothing here spawns.
export function createSessionsPanel(
  document: Document,
  options: SessionsPanelOptions,
): SessionsPanel {
  const { translator } = options;
  const t = translator.t.bind(translator);
  let sessions: SavedSessionsDocument = { folders: [], sessions: [] };
  let disposed = false;

  const element = document.createElement("section");
  element.className = "sessions-panel";
  element.setAttribute("aria-label", t("sidebar.sessions"));
  const quick = quickConnectForm(document, t, (target) =>
    options.open(
      {
        spec: { kind: "quick-ssh", target },
        label: target,
        retainOnExit: true,
      },
      "tab",
    ),
  );
  const toolbar = document.createElement("div");
  toolbar.className = "sessions-toolbar";
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = t("sessions.search");
  search.setAttribute("aria-label", t("sessions.search"));
  const addButton = iconButton(document, "+", t("sessions.new"));
  const moreButton = iconButton(
    document,
    "⋯",
    `${t("sessions.import")} / ${t("sessions.export")}`,
  );
  toolbar.append(search, addButton, moreButton);
  const list = document.createElement("div");
  list.className = "sessions-list";
  list.setAttribute("role", "tree");
  list.setAttribute("aria-label", t("sidebar.sessions"));
  const empty = document.createElement("p");
  empty.className = "sessions-empty";
  element.append(quick, toolbar, list, empty);

  let counts = countSessionPanes(options.openPanes?.list() ?? []);
  const openPanesOf = (sessionId: string) =>
    (options.openPanes?.list() ?? []).filter(
      (pane) =>
        pane.launch.spec?.kind === "saved-session" &&
        pane.launch.spec.id === sessionId,
    );
  const context: RowContext = {
    document,
    translator,
    bridge: options.bridge,
    list,
    sessions: () => sessions,
    expanded: new Set<string>(),
    open: options.open,
    notify: options.notify,
    render: () => render(),
    count: (sessionId) => counts.get(sessionId) ?? { open: 0, running: 0 },
    menu: () => ({
      document,
      translator,
      bridge: options.bridge,
      sessions,
      open: options.open,
      notify: options.notify,
      expandFolder: (id: string) => {
        context.expanded.add(id);
        render();
      },
      ...(options.openPanes
        ? { openPanes: openPanesOf, reveal: options.openPanes.reveal }
        : {}),
    }),
  };
  // Pane changes repaint only the dots and tooltips, keeping focus and
  // scroll in the list.
  const updateStatus = () => {
    if (disposed) return;
    counts = countSessionPanes(options.openPanes?.list() ?? []);
    for (const row of list.querySelectorAll<HTMLElement>(
      ".sessions-row.session",
    )) {
      const session = sessions.sessions.find(
        (candidate) => candidate.id === row.dataset.sessionId,
      );
      if (session) applySessionStatus(row, context, session);
    }
  };
  const removePanesListener = options.openPanes?.subscribe(updateStatus);

  const heading = (text: string) => {
    const item = document.createElement("h3");
    item.className = "sessions-heading";
    item.textContent = text;
    return item;
  };

  const render = () => {
    if (disposed) return;
    const query = search.value;
    const rows: HTMLElement[] = [];
    if (query.trim() === "") {
      const favorites = favoriteSessions(sessions, translator.compare);
      if (favorites.length > 0)
        rows.push(
          heading(t("sessions.favorites")),
          ...favorites.map((session) =>
            sessionRow(context, session, 0, "favorites"),
          ),
        );
      const recent = recentSessions(sessions);
      if (recent.length > 0)
        rows.push(
          heading(t("sessions.recent")),
          ...recent.map((session) => sessionRow(context, session, 0, "recent")),
        );
      if (rows.length > 0) rows.push(heading(t("sidebar.sessions")));
    }
    for (const node of visibleSessionTree(sessions, {
      query,
      expanded: context.expanded,
      compare: translator.compare,
    }))
      rows.push(
        node.kind === "folder"
          ? folderRow(context, node)
          : sessionRow(context, node.session, node.depth, "tree"),
      );
    list.replaceChildren(...rows);
    empty.hidden = sessions.sessions.length > 0 && rows.length > 0;
    empty.textContent =
      sessions.sessions.length === 0
        ? t("sessions.empty")
        : t("common.noResults");
  };

  list.addEventListener("keydown", (event) => {
    if (!handleRowKey(context, event)) return;
    event.preventDefault();
    event.stopPropagation();
  });
  search.addEventListener("input", render);
  search.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    focusRow(list, list.querySelector(".sessions-row"));
  });
  addButton.addEventListener("click", () =>
    showPanelMenu(context.menu(), addButton, "new"),
  );
  moreButton.addEventListener("click", () =>
    showPanelMenu(context.menu(), moreButton, "more"),
  );

  const removeChanged = options.bridge.onChanged((document) => {
    sessions = document;
    render();
  });
  const refresh = () =>
    void options.bridge
      .list()
      .then((document) => {
        sessions = document;
        render();
      })
      .catch((cause: unknown) => options.notify(failure(t, cause)));
  refresh();

  return {
    element,
    activate() {
      refresh();
      search.focus();
    },
    dispose() {
      disposed = true;
      removeChanged();
      removePanesListener?.();
      element.remove();
    },
  };
}

function quickConnectForm(
  document: Document,
  t: Translator["t"],
  connect: (target: string) => void,
): HTMLFormElement {
  const form = document.createElement("form");
  form.className = "sessions-quick-connect";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = t("sessions.quickConnectPlaceholder");
  input.setAttribute("aria-label", t("sessions.quickConnect"));
  input.spellcheck = false;
  const button = document.createElement("button");
  button.type = "submit";
  button.className = "omx-button omx-button-primary";
  button.textContent = t("sessions.connect");
  form.append(input, button);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const target = input.value.trim();
    // Main parses the target again; this only gives immediate feedback.
    if (!parseSshTarget(target)) {
      input.setAttribute("aria-invalid", "true");
      input.title = t("sessions.validation.host");
      return;
    }
    input.removeAttribute("aria-invalid");
    input.title = "";
    connect(target);
    input.value = "";
  });
  return form;
}

function iconButton(
  document: Document,
  glyph: string,
  label: string,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "omx-icon-button";
  button.textContent = glyph;
  button.title = label;
  button.setAttribute("aria-label", label);
  return button;
}
