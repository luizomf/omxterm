import {
  createApplicationPage,
  createPageButton,
  setPageNotice,
} from "../../src/renderer/application-page.js";
import {
  createFilesTree,
  type FilesTreeReply,
  type FilesTreeRow,
  type FilesTreeSnapshot,
} from "./tree.js";

import type { SupportedLanguage } from "../../src/shared/i18n.js";
import { filesMessages, type FilesMessages } from "./messages.js";
import { createFilesToolbar } from "./toolbar.js";

type Label = (messages: FilesMessages) => string;
type Reply = FilesTreeReply & {
  path?: string;
  token?: string;
  reason?: string;
};
type Target = { path: string; kind: string };
type Action = {
  label: Label;
  hint?: Label;
  tooltip?: Label;
  run: () => void;
  disabled?: boolean;
  checked?: boolean;
  shortcut?: { display: string; keys: string };
};
const join = (base: string, name: string) =>
  `${base.replace(/\/$/, "")}/${name}`;
const parent = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";

/** The page owns interaction targets; the tree owns asynchronous listing state. */
export function mountFilesPage(
  document: Document,
  bridge: {
    request(value: unknown): Promise<Reply>;
    onVisibility?(listener: (visible: boolean) => void): () => void;
    onLanguage?(listener: (language: SupportedLanguage) => void): () => void;
    onFocusIntent?(
      listener: (intent: "search" | "restore") => void,
    ): () => void;
  },
) {
  let messages = filesMessages("en-US");
  let disposed = false;
  let visible = !bridge.onVisibility;
  let composing = false;
  const platform = document.defaultView?.navigator.platform ?? "";
  const dotfileShortcut = platform.startsWith("Linux")
    ? { platform: "linux", display: "Ctrl+H", keys: "Control+H" }
    : platform.startsWith("Mac")
      ? { platform: "mac", display: "Cmd+Shift+.", keys: "Meta+Shift+." }
      : undefined;
  const labels = new Map<HTMLElement, () => void>();
  function label(
    element: HTMLElement,
    read: Label,
    attribute?: string,
    hint?: Label,
  ) {
    const update = () => {
      if (attribute) element.setAttribute(attribute, read(messages));
      else element.textContent = read(messages);
      if (hint) element.title = hint(messages);
    };
    labels.set(element, update);
    update();
  }
  function clear(element: HTMLElement) {
    for (const bound of labels.keys())
      if (element.contains(bound)) labels.delete(bound);
    element.replaceChildren();
  }
  const notice = document.createElement("div");
  notice.hidden = true;
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  const content = document.createElement("section");
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const tooltips = createFilesToolbar(document);
  const controlHints = new Map<HTMLButtonElement, HTMLElement>();
  const location = document.createElement("form");
  location.className = "location";
  const address = document.createElement("input");
  label(address, (m) => m.directory, "aria-label");
  address.spellcheck = false;
  const filter = document.createElement("input");
  filter.className = "entry-filter";
  filter.type = "text";
  filter.spellcheck = false;
  const updateFilterLabel = () => {
    filter.placeholder = messages.filterLoaded;
    filter.setAttribute("aria-label", messages.filterLoaded);
    filter.title = messages.filterDescription;
  };
  labels.set(filter, updateFilterLabel);
  updateFilterLabel();
  const entries = document.createElement("div");
  entries.className = "entries";
  entries.setAttribute("role", "tree");
  label(entries, (m) => m.localFiles, "aria-label");
  entries.tabIndex = 0;
  const status = document.createElement("p");
  status.className = "summary";
  const dragFeedback = document.createElement("p");
  dragFeedback.className = "drag-feedback";
  dragFeedback.hidden = true;
  dragFeedback.setAttribute("role", "status");
  const filterHint = document.createElement("p");
  filterHint.className = "filter-hint";
  filterHint.setAttribute("aria-live", "polite");
  filterHint.hidden = true;
  const editor = document.createElement("form");
  editor.className = "operation-editor";
  editor.hidden = true;
  const menu = document.createElement("div");
  menu.className = "file-menu";
  menu.setAttribute("role", "menu");
  label(menu, (m) => m.fileActions, "aria-label");
  menu.hidden = true;
  let selected: Target | undefined;
  let addressDirty = false;
  let addressRevision = 0;
  let focusRevision = 0;
  let restoringTreeFocus = false;
  let showDotfiles = false;
  let mutationPending = false;
  let confirmation: string | undefined;
  let moveConfirmation: string | undefined;
  let preparingDelete: number | undefined;
  let preparingMove: number | undefined;
  let drag: { source: Target; token: string } | undefined;
  let deferredDragSnapshot: FilesTreeSnapshot | undefined;
  let dragSerial = 0;
  const dragType = "application/x-omxterm-files-entry";
  let editorRevision = 0;
  let navigationRevision = 0;
  let menuReturn: HTMLElement | undefined;
  let editorReturn: { path?: string; element?: HTMLElement } | undefined;
  type MenuPointer = {
    scrollTop: number;
    scrolled: boolean;
    item: HTMLButtonElement | null;
  };
  const menuPointers = new Map<number, MenuPointer>();
  const releasedMenuPointers = new Map<number, MenuPointer>();
  let menuReleaseTimer: ReturnType<typeof setTimeout> | undefined;
  let menuGeneration = 0;
  let state: FilesTreeSnapshot;
  const message = (
    text: Label,
    severity: "info" | "success" | "warning" | "error" = "info",
  ) => {
    const update = () => {
      setPageNotice(notice, { text: text(messages), severity });
      tooltips.refresh();
    };
    labels.set(notice, update);
    update();
  };
  async function request(value: unknown): Promise<Reply> {
    try {
      return await bridge.request(value);
    } catch {
      return { ok: false, error: "outcome-unknown" };
    }
  }
  function report(reply: Reply, moving = false) {
    message((m) => {
      if (reply.reason === "terminal-directory-unavailable")
        return m.terminalDirectoryUnavailable;
      if (reply.reason === "terminal-directory-changed")
        return m.terminalDirectoryChanged;
      if (reply.reason === "terminal-directory-busy")
        return m.terminalDirectoryBusy;
      return reply.error === "outcome-unknown"
        ? m.unknown
        : moving
          ? m.moveError(reply.error ?? "failed")
          : m.failed(reply.error ?? "failed");
    }, "error");
  }
  function button(
    text: Label,
    action: () => void,
    container: HTMLElement = toolbar,
  ) {
    const element = createPageButton(document);
    label(element, text);
    element.addEventListener("click", action);
    container.append(element);
    return element;
  }
  function iconButton(
    icon: Parameters<typeof tooltips.create>[0],
    name: Label,
    description: Label,
    action: () => void,
    container: HTMLElement = toolbar,
  ) {
    const control = tooltips.create(icon);
    label(control.button, name, "aria-label");
    label(control.tooltip, description);
    controlHints.set(control.button, control.tooltip);
    control.button.addEventListener("click", action);
    container.append(control.wrapper);
    return control.button;
  }
  function syncControls() {
    // Reaching root must not discard focus from the just-activated Up button.
    upButton.disabled = !state.root;
    if (state.root === "/") upButton.setAttribute("aria-disabled", "true");
    else upButton.removeAttribute("aria-disabled");
    refreshButton.disabled = !state.root;
    newFolderButton.disabled =
      !state.root || mutationPending || preparingMove !== undefined;
    for (const button of [upButton, refreshButton, newFolderButton]) {
      const hint = controlHints.get(button);
      if (hint) labels.get(hint)?.();
    }
    tooltips.refresh();
  }
  function rowElement(path: string) {
    return [...entries.querySelectorAll<HTMLElement>("[data-path]")].find(
      (row) => row.dataset.path === path,
    );
  }
  function select(target: Target, focus = false) {
    selected = target;
    for (const row of entries.querySelectorAll<HTMLElement>("[data-path]")) {
      const active = row.dataset.path === target.path;
      row.setAttribute("aria-selected", String(active));
      row.tabIndex = active ? 0 : -1;
      if (active && focus) row.focus();
    }
    entries.tabIndex = -1;
  }
  function render(snapshot: FilesTreeSnapshot) {
    // Replacing the source node ends a native drag. Publish the latest listing
    // once the gesture ends instead of silently cancelling it mid-flight.
    if (drag) {
      deferredDragSnapshot = snapshot;
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const focusedPath = entries.contains(active)
      ? active?.dataset.path
      : undefined;
    const dotVisible: FilesTreeRow[] = [];
    let hiddenDepth: number | undefined;
    for (const row of snapshot.rows) {
      if (hiddenDepth !== undefined && row.depth <= hiddenDepth)
        hiddenDepth = undefined;
      if (
        !showDotfiles &&
        (hiddenDepth !== undefined || row.name.startsWith("."))
      ) {
        hiddenDepth ??= row.depth;
        continue;
      }
      dotVisible.push(row);
    }
    const query = filter.value.trim().toLowerCase();
    const matches = new Set<string>();
    if (query)
      for (let index = dotVisible.length - 1; index >= 0; index--) {
        const row = dotVisible[index]!;
        if (
          row.name.toLowerCase().includes(query) ||
          matches.has(row.path) ||
          row.loading ||
          row.error ||
          row.truncated
        ) {
          matches.add(row.path);
          if (row.depth > 0) matches.add(parent(row.path));
        }
      }
    const rows = query
      ? dotVisible.filter((row) => matches.has(row.path))
      : dotVisible;
    state = { ...snapshot, rows };
    syncControls();
    if (selected) {
      const current = state.rows.find((row) => row.path === selected?.path);
      selected = current
        ? { path: current.path, kind: current.kind }
        : undefined;
    }
    entries.setAttribute("aria-busy", String(state.loading));
    clear(entries);
    label(entries, (m) => m.localFiles, "aria-label");
    // If a focused descendant disappears, keep keyboard focus at its nearest
    // visible ancestor without silently selecting a different operation target.
    let focusPath = focusedPath;
    const visiblePaths = new Set(state.rows.map((row) => row.path));
    while (focusPath && !visiblePaths.has(focusPath)) {
      const next = parent(focusPath);
      focusPath = next === focusPath || next === state.root ? undefined : next;
    }
    focusPath ??= selected?.path ?? state.rows[0]?.path;
    for (const [index, item] of state.rows.entries()) {
      const row = document.createElement("div");
      row.className = "file-row";
      row.draggable = true;
      row.dataset.path = item.path;
      row.setAttribute("role", "treeitem");
      row.setAttribute("aria-level", String(item.depth + 1));
      row.setAttribute("aria-selected", String(selected?.path === item.path));
      label(row, (m) => `${item.name}, ${m.kind(item.kind)}`, "aria-label");
      row.tabIndex = item.path === focusPath ? 0 : -1;
      row.style.setProperty("--depth", String(Math.min(item.depth, 8)));
      if (item.kind === "directory")
        row.setAttribute("aria-expanded", String(item.expanded));
      const disclosure = document.createElement("span");
      disclosure.className = "disclosure";
      disclosure.setAttribute("aria-hidden", "true");
      disclosure.textContent =
        item.kind === "directory" ? (item.expanded ? "▾" : "▸") : "·";
      const name = document.createElement("span");
      name.className = "file-name";
      name.textContent = item.name;
      const detail = document.createElement("span");
      detail.className = "kind";
      label(detail, (m) =>
        item.kind === "directory"
          ? m.folder
          : item.kind === "link"
            ? m.link
            : "",
      );
      row.title = item.path;
      row.append(disclosure, name, detail);
      row.addEventListener("focus", () => {
        if (!restoringTreeFocus) select(item);
      });
      row.addEventListener("click", (event) => {
        select(item, true);
        if (event.target === disclosure && item.kind === "directory")
          void tree.toggle(item.path);
      });
      row.addEventListener("dblclick", (event) => {
        if (event.target !== disclosure && item.kind === "directory")
          void tree.toggle(item.path);
      });
      row.addEventListener("dragstart", (event) => {
        if (!event.dataTransfer || !canStartMove()) {
          event.preventDefault();
          return;
        }
        select(item);
        drag = {
          source: { path: item.path, kind: item.kind },
          token: String(++dragSerial),
        };
        // Never put local paths into a payload that can leave this view.
        event.dataTransfer.setData(dragType, drag.token);
        event.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("keydown", (event) => rowKey(event, item));
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        select(item, true);
        openMenu(item, event.clientX, event.clientY, row);
      });
      entries.append(row);
      const filteredChildren =
        !showDotfiles &&
        item.total !== null &&
        item.total > 0 &&
        (state.rows[index + 1]?.depth ?? 0) <= item.depth;
      if (
        item.expanded &&
        (item.loading ||
          item.error ||
          item.truncated ||
          item.total === 0 ||
          filteredChildren)
      ) {
        const hint = document.createElement("div");
        hint.className = "tree-hint";
        label(hint, (m) =>
          item.loading
            ? m.readingFolder
            : item.error
              ? m.folderUnavailable(item.error)
              : item.truncated
                ? m.truncatedFolder
                : filteredChildren
                  ? m.noVisibleEntries
                  : m.emptyFolder,
        );
        entries.append(hint);
      }
    }
    entries.tabIndex = state.rows.length ? -1 : 0;
    if (focusedPath && visible) {
      const target =
        rowElement(focusedPath) ?? rowElement(focusPath ?? "") ?? entries;
      restoringTreeFocus = true;
      try {
        target.focus({ preventScroll: target.dataset.path === focusedPath });
      } finally {
        restoringTreeFocus = false;
      }
    }
    const dotfilesFiltered = snapshot.rows.length > dotVisible.length;
    const noVisible =
      !!state.root && !state.loading && !state.error && !rows.length;
    filterHint.hidden = !dotfilesFiltered && !noVisible;
    label(filterHint, (m) =>
      noVisible && query
        ? dotfilesFiltered
          ? m.noMatchingVisibleDotfiles
          : m.noMatchingLoadedEntries
        : noVisible
          ? dotfilesFiltered
            ? m.noVisibleDotfiles
            : m.noVisibleEntries
          : m.dotfilesHidden,
    );
    label(status, (m) =>
      state.rootLoading
        ? m.readingDirectory
        : state.error
          ? m.directoryUnavailable(state.error)
          : m.entries(state.rows.length, state.truncated),
    );
    tooltips.refresh();
  }
  const tree = createFilesTree(request, (snapshot) => {
    if (!addressDirty && document.activeElement !== address)
      address.value = snapshot.root ?? "";
    render(snapshot);
  });
  state = tree.snapshot();
  address.addEventListener("input", () => {
    addressDirty = true;
    addressRevision++;
  });
  filter.addEventListener("input", () => render(tree.snapshot()));
  function navigate(path: string, preserveDraft = false) {
    navigationRevision++;
    if (!preserveDraft) addressDirty = false;
    closeMenu(false);
    return tree.navigate(path);
  }
  async function navigateFrom(
    operation: "home" | "terminal-directory",
    initial = false,
  ) {
    const revision = ++navigationRevision;
    const addressAtRequest = addressRevision;
    const reply = await request({ operation });
    if (revision !== navigationRevision) return;
    if (reply.directory)
      await navigate(
        reply.directory,
        initial || addressAtRequest !== addressRevision,
      );
    else report(reply);
  }
  function rowKey(event: KeyboardEvent, item: FilesTreeRow) {
    if (
      event.defaultPrevented ||
      composing ||
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.getModifierState("AltGraph") ||
      (event.shiftKey && event.key !== "F10")
    )
      return;
    const index = state.rows.findIndex((row) => row.path === item.path);
    let next: FilesTreeRow | undefined;
    switch (event.key) {
      case "ArrowDown":
        next = state.rows[index + 1];
        break;
      case "ArrowUp":
        next = state.rows[index - 1];
        break;
      case "Home":
        next = state.rows[0];
        break;
      case "End":
        next = state.rows.at(-1);
        break;
      case "ArrowRight":
        if (item.kind === "directory" && !item.expanded)
          void tree.toggle(item.path);
        else if (state.rows[index + 1]?.depth === item.depth + 1)
          next = state.rows[index + 1];
        break;
      case "ArrowLeft":
        if (item.expanded) void tree.toggle(item.path);
        else
          next = state.rows
            .slice(0, index)
            .reverse()
            .find((row) => row.depth === item.depth - 1);
        break;
      case "Enter":
      case " ":
        select(item);
        if (item.kind === "directory") void tree.toggle(item.path);
        break;
      case "F2":
        if (!mutationPending) {
          select(item);
          rename(item);
        }
        break;
      case "ContextMenu":
        select(item);
        openMenu(item, undefined, undefined, rowElement(item.path));
        break;
      case "F10":
        if (!event.shiftKey) return;
        select(item);
        openMenu(item, undefined, undefined, rowElement(item.path));
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (next) select(next, true);
  }
  function discardConfirmation() {
    editorRevision++;
    preparingDelete = undefined;
    preparingMove = undefined;
    editor.inert = false;
    if (confirmation)
      void request({ operation: "cancel-delete", token: confirmation });
    if (moveConfirmation)
      void request({ operation: "cancel-move", token: moveConfirmation });
    confirmation = undefined;
    moveConfirmation = undefined;
  }
  function captureEditorReturn() {
    const active = document.activeElement as HTMLElement | null;
    if (active && entries.contains(active))
      return active.dataset.path
        ? { path: active.dataset.path }
        : { element: entries };
    return active &&
      (toolbar.contains(active) ||
        location.contains(active) ||
        active === filter)
      ? { element: active }
      : {};
  }
  function restoreEditorFocus() {
    const target = editorReturn?.path
      ? rowElement(editorReturn.path)
      : editorReturn?.element;
    (target?.isConnected ? target : actionsButton).focus();
  }
  function dismissEditor() {
    discardConfirmation();
    editor.hidden = true;
    syncControls();
    restoreEditorFocus();
  }
  async function mutate(value: unknown, moving = false) {
    if (mutationPending || preparingMove !== undefined) return;
    const active = document.activeElement as HTMLElement | null;
    const editorFocus = active && editor.contains(active) ? active : undefined;
    const revision = focusRevision;
    let completed = false;
    mutationPending = true;
    syncControls();
    discardConfirmation();
    editor.inert = true;
    if (moving) editor.hidden = true;
    message((m) => m.pending);
    try {
      const reply = await request(value);
      if (reply.ok) {
        completed = true;
        editor.hidden = true;
        await tree.refresh();
        const current = tree.snapshot();
        message(
          (m) =>
            current.error || current.rows.some((row) => row.error)
              ? m.refreshFailed
              : m.completed,
          current.error || current.rows.some((row) => row.error)
            ? "warning"
            : "success",
        );
      } else report(reply, moving);
    } finally {
      mutationPending = false;
      syncControls();
      editor.inert = false;
      if (
        editorFocus &&
        revision === focusRevision &&
        !disposed &&
        visible &&
        document.hasFocus()
      ) {
        if (completed || moving) restoreEditorFocus();
        else if (editorFocus.isConnected && !editor.hidden) editorFocus.focus();
      }
    }
  }
  function form(
    caption: Label,
    initial: string,
    submit: (value: string) => void,
  ) {
    if (mutationPending || preparingMove !== undefined) return;
    editorReturn = captureEditorReturn();
    discardConfirmation();
    clear(editor);
    editor.hidden = false;
    const text = document.createElement("label");
    const captionElement = document.createElement("span");
    label(captionElement, caption);
    text.append(captionElement);
    const input = document.createElement("input");
    input.value = initial;
    input.required = true;
    input.spellcheck = false;
    text.append(input);
    editor.append(text);
    const save = createPageButton(document, "primary");
    save.type = "submit";
    label(save, (m) => m.apply);
    editor.append(save);
    button((m) => m.cancel, dismissEditor, editor);
    editor.onsubmit = (event) => {
      event.preventDefault();
      submit(input.value);
    };
    input.focus();
    input.select();
  }
  function creation(
    operation: "create-file" | "create-directory",
    directory = state.root,
  ) {
    if (!directory) return;
    form(
      (m) => m.create(operation === "create-file", directory),
      "",
      (name) => {
        if (
          !name ||
          name === "." ||
          name === ".." ||
          name.includes("/") ||
          name.includes("\0")
        ) {
          message((m) => m.invalidName, "warning");
          return;
        }
        void mutate({ operation, path: join(directory, name) });
      },
    );
  }
  function rename(target: Target) {
    const captured = target.path;
    form(
      (m) => m.move(captured),
      captured,
      (destination) => {
        void mutate({ operation: "move", path: captured, destination });
      },
    );
  }
  function canStartMove() {
    return (
      visible &&
      !disposed &&
      !mutationPending &&
      preparingMove === undefined &&
      preparingDelete === undefined &&
      editor.hidden
    );
  }
  function moveToFolder(target: Target) {
    const captured = { ...target };
    form(
      (m) => m.moveFolderPrompt(captured.path),
      parent(captured.path),
      (directory) => void prepareMove(captured, directory, false),
    );
  }
  async function prepareMove(
    target: Target,
    directory: string,
    fromDrop: boolean,
  ) {
    if (mutationPending || preparingMove !== undefined) return;
    if (fromDrop) editorReturn = { path: target.path };
    discardConfirmation();
    const revision = editorRevision;
    const focusAtRequest = focusRevision;
    const focused = document.activeElement;
    const focusedInEditor = !!focused && editor.contains(focused);
    preparingMove = revision;
    editor.inert = true;
    syncControls();
    message((m) => m.preparingMove);
    const reply = await request({
      operation: "prepare-move-into",
      path: target.path,
      kind: target.kind,
      directory,
    });
    if (revision !== editorRevision) {
      if (reply.token)
        void request({ operation: "cancel-move", token: reply.token });
      return;
    }
    preparingMove = undefined;
    editor.inert = false;
    syncControls();
    if (!reply.ok || !reply.token || !reply.path || !reply.directory) {
      report(reply, true);
      return;
    }
    moveConfirmation = reply.token;
    message((m) => m.reviewMove);
    const shouldFocus =
      visible &&
      document.hasFocus() &&
      focusRevision === focusAtRequest &&
      (document.activeElement === focused ||
        (focusedInEditor && document.activeElement === document.body));
    clear(editor);
    editor.hidden = false;
    const warning = document.createElement("p");
    label(warning, (m) => m.confirmMove(reply.path!, reply.directory!));
    editor.append(warning);
    // Cancel is first in tab order and in the host's retained-editor focus path.
    const cancel = button((m) => m.cancel, dismissEditor, editor);
    button(
      (m) => m.moveAction,
      () => {
        if (moveConfirmation !== reply.token) return;
        moveConfirmation = undefined;
        void mutate({ operation: "move-into", token: reply.token }, true);
      },
      editor,
    );
    editor.onsubmit = (event) => event.preventDefault();
    if (shouldFocus) cancel.focus();
  }
  async function prepareDelete(target: Target) {
    if (mutationPending || preparingMove !== undefined) return;
    discardConfirmation();
    const origin = captureEditorReturn();
    const focused = document.activeElement;
    const focusAtRequest = focusRevision;
    const revision = editorRevision;
    preparingDelete = revision;
    const reply = await request({
      operation: "prepare-delete",
      path: target.path,
    });
    if (preparingDelete === revision) preparingDelete = undefined;
    if (revision !== editorRevision) {
      if (reply.token)
        void request({ operation: "cancel-delete", token: reply.token });
      return;
    }
    if (!reply.ok || !reply.token) {
      report(reply);
      return;
    }
    confirmation = reply.token;
    editorReturn = origin;
    clear(editor);
    editor.hidden = false;
    const warning = document.createElement("p");
    label(warning, (m) => m.confirmation(reply.path ?? target.path));
    editor.append(warning);
    const confirm = button(
      (m) => m.delete,
      () => {
        confirmation = undefined;
        void mutate({ operation: "delete", token: reply.token });
      },
      editor,
    );
    button((m) => m.cancel, dismissEditor, editor);
    editor.onsubmit = (event) => event.preventDefault();
    if (
      visible &&
      document.hasFocus() &&
      focusRevision === focusAtRequest &&
      document.activeElement ===
        (origin.path ? rowElement(origin.path) : focused)
    )
      confirm.focus();
  }
  function toggleDotfiles() {
    showDotfiles = !showDotfiles;
    render(tree.snapshot());
  }
  function actions(target?: Target): Action[] {
    const busy = mutationPending || preparingMove !== undefined;
    const directory = target
      ? target.kind === "directory"
        ? target.path
        : parent(target.path)
      : state.root;
    return [
      ...(target?.kind === "directory"
        ? [
            {
              label: (m: FilesMessages) => m.openDirectory,
              run: () => {
                void navigate(target.path);
              },
            },
          ]
        : []),
      {
        label: (m) => m.newFile,
        run: () => creation("create-file", directory),
        disabled: !directory || busy,
      },
      {
        label: (m) => m.newFolder,
        run: () => creation("create-directory", directory),
        disabled: !directory || busy,
      },
      ...(target
        ? [
            {
              label: (m: FilesMessages) => m.rename,
              run: () => rename(target),
              disabled: busy,
              shortcut: { display: "F2", keys: "F2" },
            },
            {
              label: (m: FilesMessages) => m.moveToFolder,
              run: () => moveToFolder(target),
              disabled: busy,
            },
            {
              label: (m: FilesMessages) => m.trash,
              run: () => {
                void mutate({ operation: "trash", path: target.path });
              },
              disabled: busy,
            },
            {
              label: (m: FilesMessages) => m.prepareDelete,
              run: () => {
                void prepareDelete(target);
              },
              disabled: busy,
            },
          ]
        : []),
      {
        label: (m) => m.refresh,
        run: () => {
          void tree.refresh();
        },
      },
      {
        label: (m) => m.terminalDirectory,
        hint: (m) => m.terminalDirectoryHint,
        tooltip: (m) => m.terminalDirectoryTooltip,
        run: () => {
          void navigateFrom("terminal-directory");
        },
      },
      {
        label: (m) => m.showDotfiles,
        checked: showDotfiles,
        ...(dotfileShortcut ? { shortcut: dotfileShortcut } : {}),
        run: toggleDotfiles,
      },
    ];
  }
  function resetMenuGesture() {
    menuGeneration++;
    menuPointers.clear();
    releasedMenuPointers.clear();
    if (menuReleaseTimer !== undefined) clearTimeout(menuReleaseTimer);
    menuReleaseTimer = undefined;
  }
  const menuGestureActive = () =>
    menuPointers.size > 0 || menuReleaseTimer !== undefined;
  function closeMenu(restore = true) {
    resetMenuGesture();
    if (menu.hidden) return;
    menu.hidden = true;
    tooltips.suppress(false);
    actionsButton.setAttribute("aria-expanded", "false");
    if (restore)
      (menuReturn?.isConnected
        ? menuReturn
        : (rowElement(selected?.path ?? "") ?? actionsButton)
      )?.focus();
  }
  function revealMenuItem(item: HTMLElement) {
    // Scroll only the popup, using its current wrapped layout. Leave room for
    // the shared focus outline (2px plus a 2px offset), not just the text.
    const top = menu.getBoundingClientRect().top + menu.clientTop + 4;
    const bottom = top + menu.clientHeight - 8;
    const rect = item.getBoundingClientRect();
    if (rect.top < top || rect.height > bottom - top)
      menu.scrollTop += rect.top - top;
    else if (rect.bottom > bottom) menu.scrollTop += rect.bottom - bottom;
  }
  function focusMenuItem(item?: HTMLButtonElement) {
    if (!item) return;
    item.focus({ preventScroll: true });
    revealFocusedMenuItem();
  }
  function placeMenu(x: number, y: number) {
    const viewport = document.documentElement;
    menu.style.left = `${Math.max(0, Math.min(x, viewport.clientWidth - menu.offsetWidth))}px`;
    menu.style.top = `${Math.max(0, Math.min(y, viewport.clientHeight - menu.offsetHeight))}px`;
  }
  function revealFocusedMenuItem() {
    if (disposed || menu.hidden) return;
    if (menuGestureActive()) {
      closeMenu(false);
      return;
    }
    const rect = menu.getBoundingClientRect();
    placeMenu(rect.left, rect.top);
    const active = document.activeElement as HTMLElement | null;
    if (active?.parentElement === menu) revealMenuItem(active);
  }
  // A resize during a press cancels the menu rather than moving its target.
  document.defaultView?.addEventListener("resize", revealFocusedMenuItem);
  function openMenu(
    target?: Target,
    x?: number,
    y?: number,
    anchor?: HTMLElement,
  ) {
    resetMenuGesture();
    const generation = menuGeneration;
    menuReturn = anchor ?? actionsButton;
    clear(menu);
    label(menu, (m) => m.fileActions, "aria-label");
    for (const action of actions(target)) {
      const item = button(
        action.label,
        () => {
          if (menu.hidden || generation !== menuGeneration) return;
          closeMenu();
          action.run();
        },
        menu,
      );
      if (action.hint) {
        const caption = document.createElement("span");
        const hint = document.createElement("span");
        hint.className = "menu-action-hint";
        hint.id = `files-menu-hint-${menu.childElementCount}`;
        labels.delete(item);
        label(item, action.label, "aria-label", action.tooltip ?? action.hint);
        label(caption, action.label);
        label(hint, action.hint);
        item.setAttribute("aria-describedby", hint.id);
        item.replaceChildren(caption, hint);
      }
      item.setAttribute(
        "role",
        action.checked === undefined ? "menuitem" : "menuitemcheckbox",
      );
      if (action.checked !== undefined) {
        item.setAttribute("aria-checked", String(action.checked));
        const indicator = document.createElement("span");
        indicator.className = "menu-check";
        indicator.setAttribute("aria-hidden", "true");
        indicator.textContent = action.checked ? "✓" : "□";
        const caption = document.createElement("span");
        caption.className = "menu-caption";
        caption.id = "files-dotfiles-caption";
        item.setAttribute("aria-labelledby", caption.id);
        labels.delete(item);
        label(caption, action.label);
        item.replaceChildren(indicator, caption);
        if (action.shortcut) {
          const shortcut = document.createElement("span");
          shortcut.className = "menu-shortcut";
          shortcut.id = "files-dotfiles-shortcut";
          label(shortcut, (m) => m.shortcut(action.shortcut!.display));
          item.setAttribute("aria-describedby", shortcut.id);
          item.setAttribute("aria-keyshortcuts", action.shortcut.keys);
          item.append(shortcut);
        }
      }
      if (action.shortcut && action.checked === undefined) {
        const caption = document.createElement("span");
        const shortcut = document.createElement("span");
        shortcut.className = "menu-shortcut";
        shortcut.id = `files-menu-shortcut-${menu.childElementCount}`;
        labels.delete(item);
        label(item, action.label, "aria-label");
        label(caption, action.label);
        label(shortcut, (m) => m.shortcut(action.shortcut!.display));
        item.setAttribute("aria-describedby", shortcut.id);
        item.setAttribute("aria-keyshortcuts", action.shortcut.keys);
        item.replaceChildren(caption, shortcut);
      }
      item.disabled = !!action.disabled;
      item.tabIndex = -1;
    }
    menu.hidden = false;
    tooltips.suppress(true);
    actionsButton.setAttribute("aria-expanded", "true");
    const rect = menuReturn.getBoundingClientRect();
    placeMenu(x ?? rect.left, y ?? rect.bottom);
    focusMenuItem(
      menu.querySelector<HTMLButtonElement>("button:not(:disabled)") ??
        undefined,
    );
  }
  menu.addEventListener("keydown", (event) => {
    if (menuGestureActive() && event.key !== "Escape") {
      event.preventDefault();
      return;
    }
    const items = [
      ...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    ];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      // A composing Escape, and an unowned repeat, stay with the IME.
      if (event.repeat || composing || event.isComposing) return;
      event.preventDefault();
      closeMenu();
    } else if (event.key === "Tab") closeMenu();
    else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
              items.length;
      focusMenuItem(items[next]);
    }
  });
  const dismissMenu = (event: PointerEvent) => {
    if (!menu.contains(event.target as Node)) {
      closeMenu(false);
      return;
    }
    if (menuReleaseTimer !== undefined) clearTimeout(menuReleaseTimer);
    menuReleaseTimer = undefined;
    releasedMenuPointers.delete(event.pointerId);
    const item = (event.target as Element).closest<HTMLButtonElement>("button");
    menuPointers.set(event.pointerId, {
      scrollTop: menu.scrollTop,
      scrolled: false,
      item: item?.parentElement === menu ? item : null,
    });
  };
  menu.addEventListener("scroll", () => {
    for (const pointer of [
      ...menuPointers.values(),
      ...releasedMenuPointers.values(),
    ])
      if (menu.scrollTop !== pointer.scrollTop) pointer.scrolled = true;
  });
  const finishMenuPointer = (event: PointerEvent) => {
    const pointer = menuPointers.get(event.pointerId);
    if (!pointer) return;
    menuPointers.delete(event.pointerId);
    // Unknown or evicted pointer clicks are refused, so this cap is fail-closed.
    if (releasedMenuPointers.size >= 32)
      releasedMenuPointers.delete(releasedMenuPointers.keys().next().value!);
    releasedMenuPointers.set(event.pointerId, pointer);
    if (menuPointers.size) return;
    const generation = menuGeneration;
    // Let the browser dispatch click before revealing any remaining clipped item.
    menuReleaseTimer = setTimeout(() => {
      menuReleaseTimer = undefined;
      if (disposed || generation !== menuGeneration || menuPointers.size)
        return;
      const scrolled = [...releasedMenuPointers.values()].some(
        (released) =>
          released.scrolled || released.scrollTop !== menu.scrollTop,
      );
      // Do not undo deliberate scrolling or a stationary scrollbar press.
      if (scrolled || !pointer.item) return;
      const before = menu.getBoundingClientRect();
      const scrollTop = menu.scrollTop;
      revealFocusedMenuItem();
      const after = menu.getBoundingClientRect();
      if (
        scrollTop !== menu.scrollTop ||
        before.left !== after.left ||
        before.top !== after.top
      )
        for (const released of releasedMenuPointers.values())
          released.scrolled = true;
    }, 0);
  };
  const guardScrolledMenuClick = (event: MouseEvent) => {
    if (!event.detail || !menu.contains(event.target as Node)) return;
    const id = (event as PointerEvent).pointerId;
    const pointer = releasedMenuPointers.get(id);
    if (
      pointer &&
      !pointer.scrolled &&
      pointer.scrollTop === menu.scrollTop &&
      pointer.item?.contains(event.target as Node)
    )
      return;
    // Never activate a retargeted or unrecognized pointer click.
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  // Touch panning cancels its pointer without dismissing the scrollable menu.
  const cancelMenuPointer = (event: PointerEvent) => {
    menuPointers.delete(event.pointerId);
  };
  const blurMenu = () => {
    if (menuGestureActive()) closeMenu(false);
  };
  document.addEventListener("pointerdown", dismissMenu, true);
  document.addEventListener("pointerup", finishMenuPointer, true);
  document.addEventListener("pointercancel", cancelMenuPointer, true);
  document.addEventListener("click", guardScrolledMenuClick, true);
  document.defaultView?.addEventListener("blur", blurMenu);
  function clearDragFeedback() {
    dragFeedback.hidden = true;
    labels.delete(dragFeedback);
    for (const row of entries.querySelectorAll<HTMLElement>("[data-drop]"))
      delete row.dataset.drop;
  }
  function resetDrag() {
    drag = undefined;
    clearDragFeedback();
    const pending = deferredDragSnapshot;
    deferredDragSnapshot = undefined;
    if (pending && !disposed) render(pending);
  }
  function dropTarget(event: DragEvent) {
    const element = event.target;
    if (!(element instanceof document.defaultView!.Element)) return undefined;
    const row = element.closest<HTMLElement>(".file-row");
    return row && entries.contains(row)
      ? state.rows.find((item) => item.path === row.dataset.path)
      : undefined;
  }
  function internalDrag(event: DragEvent) {
    const types = Array.from(event.dataTransfer?.types ?? []);
    return !!drag && types.includes(dragType) && !types.includes("Files");
  }
  function validDrop(target: FilesTreeRow | undefined) {
    if (!drag || !target || target.kind !== "directory" || !canStartMove())
      return false;
    const source = drag.source;
    return (
      parent(source.path) !== target.path &&
      (source.kind !== "directory" ||
        (target.path !== source.path &&
          !target.path.startsWith(`${source.path}/`)))
    );
  }
  entries.addEventListener("dragover", (event) => {
    event.preventDefault();
    const internal = internalDrag(event);
    const target = dropTarget(event);
    const valid = internal && validDrop(target);
    if (event.dataTransfer)
      event.dataTransfer.dropEffect = valid ? "move" : "none";
    for (const row of entries.querySelectorAll<HTMLElement>("[data-drop]"))
      delete row.dataset.drop;
    const row = target && rowElement(target.path);
    if (row) row.dataset.drop = valid ? "valid" : "invalid";
    dragFeedback.hidden = false;
    label(
      dragFeedback,
      internal
        ? valid
          ? (m) => m.dropReady(target!.name)
          : (m) => m.dropInvalid
        : (m) => m.dropExternal,
    );
  });
  entries.addEventListener("dragleave", (event) => {
    if (!entries.contains(event.relatedTarget as Node | null))
      clearDragFeedback();
  });
  entries.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const internal = internalDrag(event);
    const target = dropTarget(event);
    const source = drag?.source;
    const valid =
      internal &&
      validDrop(target) &&
      event.dataTransfer?.getData(dragType) === drag?.token;
    resetDrag();
    if (valid && source && target) void prepareMove(source, target.path, true);
    else message((m) => (internal ? m.dropInvalid : m.dropExternal), "warning");
  });
  document.addEventListener("dragend", resetDrag);
  entries.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    openMenu(undefined, event.clientX, event.clientY, entries);
  });
  entries.addEventListener("keydown", (event) => {
    if (
      event.target !== entries ||
      event.defaultPrevented ||
      composing ||
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.getModifierState("AltGraph")
    )
      return;
    if (
      !event.shiftKey &&
      ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
    ) {
      const target =
        event.key === "ArrowUp" || event.key === "End"
          ? state.rows.at(-1)
          : state.rows[0];
      if (target) {
        event.preventDefault();
        select(target, true);
      }
      return;
    }
    if (
      (event.key === "ContextMenu" && !event.shiftKey) ||
      (event.key === "F10" && event.shiftKey)
    ) {
      event.preventDefault();
      openMenu(undefined, undefined, undefined, entries);
    }
  });
  editor.addEventListener("keydown", (event) => {
    // A composing Escape, and an unowned repeat, stay with the IME.
    if (
      event.key === "Escape" &&
      !mutationPending &&
      !event.repeat &&
      !composing &&
      !event.isComposing
    ) {
      event.preventDefault();
      dismissEditor();
    }
  });
  iconButton(
    "home",
    (m) => m.home,
    (m) => m.homeHint,
    () => {
      void navigateFrom("home");
    },
  );
  const upButton = iconButton(
    "up",
    (m) => m.up,
    (m) =>
      !state.root ? m.noRootHint : state.root === "/" ? m.atRootHint : m.upHint,
    () => {
      if (state.root && state.root !== "/") void navigate(parent(state.root));
    },
  );
  const refreshButton = iconButton(
    "refresh",
    (m) => m.refresh,
    (m) => (!state.root ? m.noRootHint : m.refreshHint),
    () => {
      void tree.refresh();
    },
  );
  const actionPair = document.createElement("span");
  actionPair.className = "toolbar-pair";
  toolbar.append(actionPair);
  const newFolderButton = iconButton(
    "new-folder",
    (m) => m.newFolder,
    (m) =>
      mutationPending || preparingMove !== undefined
        ? m.mutationPendingHint
        : !state.root
          ? m.noRootHint
          : m.newFolderHint,
    () => creation("create-directory"),
    actionPair,
  );
  const actionsButton = iconButton(
    "actions",
    (m) => m.actions,
    (m) => m.actionsHint,
    () => openMenu(selected),
    actionPair,
  );
  actionsButton.setAttribute("aria-haspopup", "menu");
  actionsButton.setAttribute("aria-expanded", "false");
  location.append(address);
  const go = iconButton(
    "go",
    (m) => m.go,
    (m) => m.goHint,
    () => {},
    location,
  );
  go.type = "submit";
  syncControls();
  location.addEventListener("submit", (event) => {
    event.preventDefault();
    void navigate(address.value);
  });
  content.append(toolbar, location, filter, dragFeedback, entries, filterHint);
  // The host supplies the visible tool identity; retain a named child region.
  const page = createApplicationPage(document, { notice, content, status });
  page.setAttribute("role", "region");
  label(page, (m) => m.title, "aria-label");
  document.body.append(page, editor, menu);
  const onShortcut = (event: KeyboardEvent) => {
    const target = event.target;
    if (
      disposed ||
      !visible ||
      !state.root ||
      !document.hasFocus() ||
      event.defaultPrevented ||
      composing ||
      event.isComposing ||
      !editor.hidden ||
      mutationPending ||
      preparingMove !== undefined ||
      preparingDelete !== undefined ||
      !(target instanceof document.defaultView!.Element) ||
      (!page.contains(target) && !menu.contains(target)) ||
      target.closest(
        "input, textarea, select, [contenteditable]:not([contenteditable='false'])",
      ) ||
      !dotfileShortcut ||
      event.altKey ||
      event.getModifierState("AltGraph")
    )
      return;
    const matches =
      dotfileShortcut.platform === "linux"
        ? event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          event.key.toLowerCase() === "h"
        : event.metaKey &&
          event.shiftKey &&
          !event.ctrlKey &&
          event.code === "Period" &&
          (event.key === "." || event.key === ">");
    if (!matches) return;
    event.preventDefault();
    if (event.repeat) return;
    closeMenu();
    toggleDotfiles();
  };
  const recordFocusChange = () => {
    if (!restoringTreeFocus) focusRevision++;
  };
  // A user gesture during asynchronous preparation owns subsequent focus,
  // even if it lands on a non-focusable element while the editor is inert.
  const recordPreparationInteraction = () => {
    if (preparingMove !== undefined) focusRevision++;
  };
  document.addEventListener("pointerdown", recordPreparationInteraction, true);
  document.addEventListener("keydown", recordPreparationInteraction, true);
  document.addEventListener("focusin", recordFocusChange);
  document.defaultView?.addEventListener("blur", recordFocusChange);
  const startComposition = () => {
    composing = true;
  };
  const endComposition = () => {
    composing = false;
  };
  document.addEventListener("compositionstart", startComposition);
  document.addEventListener("compositionend", endComposition);
  document.addEventListener("keydown", onShortcut);
  // Native Escape belongs to the companion host, not this DOM menu. Hiding
  // dismisses transient menus while operation drafts remain retained.
  const unsubscribeVisibility = bridge.onVisibility?.((shown) => {
    visible = shown;
    if (!shown) {
      focusRevision++;
      composing = false;
      resetDrag();
      closeMenu(false);
      tooltips.reset();
    }
  });
  document.documentElement.lang = "en-US";
  const unsubscribeFocus = bridge.onFocusIntent?.((intent) => {
    if (disposed || !visible) return;
    const active = document.activeElement as HTMLElement | null;
    if (
      intent === "restore" &&
      active &&
      active.isConnected &&
      !active.closest("[hidden], [inert]") &&
      (page.contains(active) ||
        (!editor.hidden && !editor.inert && editor.contains(active)))
    ) {
      active.focus();
      return;
    }
    if (!editor.hidden && !editor.inert) {
      const target = editor.contains(active)
        ? active
        : editor.querySelector<HTMLElement>("input, button:not(:disabled)");
      if (target) {
        target.focus();
        return;
      }
    }
    filter.focus();
  });
  const unsubscribeLanguage = bridge.onLanguage?.((language) => {
    if (disposed) return;
    if (menuGestureActive()) closeMenu(false);
    document.documentElement.lang = language;
    messages = filesMessages(language);
    for (const update of labels.values()) update();
    revealFocusedMenuItem();
    tooltips.refresh();
  });
  const ready = navigateFrom("home", true);
  return {
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      navigationRevision++;
      resetDrag();
      discardConfirmation();
      unsubscribeVisibility?.();
      unsubscribeLanguage?.();
      unsubscribeFocus?.();
      tooltips.dispose();
      controlHints.clear();
      labels.clear();
      document.defaultView?.removeEventListener(
        "resize",
        revealFocusedMenuItem,
      );
      resetMenuGesture();
      document.removeEventListener("pointerdown", dismissMenu, true);
      document.removeEventListener("pointerup", finishMenuPointer, true);
      document.removeEventListener("pointercancel", cancelMenuPointer, true);
      document.removeEventListener("click", guardScrolledMenuClick, true);
      document.defaultView?.removeEventListener("blur", blurMenu);
      document.removeEventListener("keydown", onShortcut);
      document.removeEventListener("focusin", recordFocusChange);
      document.removeEventListener(
        "pointerdown",
        recordPreparationInteraction,
        true,
      );
      document.removeEventListener(
        "keydown",
        recordPreparationInteraction,
        true,
      );
      document.defaultView?.removeEventListener("blur", recordFocusChange);
      document.removeEventListener("compositionstart", startComposition);
      document.removeEventListener("compositionend", endComposition);
      document.removeEventListener("dragend", resetDrag);
    },
  };
}
