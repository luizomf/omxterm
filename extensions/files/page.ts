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

type Label = (messages: FilesMessages) => string;
type Reply = FilesTreeReply & { path?: string; token?: string };
type Target = { path: string; kind: string };
type Action = { label: Label; run: () => void; disabled?: boolean };
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
  },
) {
  let messages = filesMessages("en-US");
  let disposed = false;
  const labels = new Map<HTMLElement, () => void>();
  function label(element: HTMLElement, read: Label, attribute?: string) {
    const update = () => {
      if (attribute) element.setAttribute(attribute, read(messages));
      else element.textContent = read(messages);
    };
    labels.set(element, update);
    update();
  }
  function clear(element: HTMLElement) {
    for (const bound of labels.keys())
      if (element.contains(bound)) labels.delete(bound);
    element.replaceChildren();
  }
  const title = document.createElement("div");
  const heading = document.createElement("h1");
  label(heading, (m) => m.title);
  title.append(heading);
  const notice = document.createElement("div");
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  const content = document.createElement("section");
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const location = document.createElement("form");
  location.className = "location";
  const address = document.createElement("input");
  label(address, (m) => m.directory, "aria-label");
  address.spellcheck = false;
  const entries = document.createElement("div");
  entries.className = "entries";
  entries.setAttribute("role", "tree");
  label(entries, (m) => m.localFiles, "aria-label");
  entries.tabIndex = 0;
  const status = document.createElement("p");
  status.className = "summary";
  const editor = document.createElement("form");
  editor.className = "operation-editor";
  editor.hidden = true;
  const menu = document.createElement("div");
  menu.className = "file-menu";
  menu.setAttribute("role", "menu");
  label(menu, (m) => m.fileActions, "aria-label");
  menu.hidden = true;
  let selected: Target | undefined;
  let mutationPending = false;
  let confirmation: string | undefined;
  let editorRevision = 0;
  let navigationRevision = 0;
  let menuReturn: HTMLElement | undefined;
  let state: FilesTreeSnapshot;
  const message = (
    text: Label,
    severity: "info" | "success" | "warning" | "error" = "info",
  ) => {
    const update = () =>
      setPageNotice(notice, { text: text(messages), severity });
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
  function report(reply: Reply) {
    message(
      (m) =>
        reply.error === "outcome-unknown"
          ? m.unknown
          : m.failed(reply.error ?? "failed"),
      "error",
    );
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
    const active = document.activeElement as HTMLElement | null;
    const focusedPath = entries.contains(active)
      ? active?.dataset.path
      : undefined;
    state = snapshot;
    if (selected) {
      const current = state.rows.find((row) => row.path === selected?.path);
      selected = current
        ? { path: current.path, kind: current.kind }
        : undefined;
    }
    if (document.activeElement !== address) address.value = state.root ?? "";
    entries.setAttribute("aria-busy", String(state.loading));
    clear(entries);
    label(entries, (m) => m.localFiles, "aria-label");
    const focusPath = selected?.path ?? state.rows[0]?.path;
    for (const item of state.rows) {
      const row = document.createElement("div");
      row.className = "file-row";
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
      row.addEventListener("click", (event) => {
        select(item, true);
        if (event.target === disclosure && item.kind === "directory")
          void tree.toggle(item.path);
      });
      row.addEventListener("dblclick", (event) => {
        if (event.target !== disclosure && item.kind === "directory")
          void tree.toggle(item.path);
      });
      row.addEventListener("keydown", (event) => rowKey(event, item));
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        select(item, true);
        openMenu(item, event.clientX, event.clientY, row);
      });
      entries.append(row);
      if (
        item.expanded &&
        (item.loading || item.error || item.truncated || item.total === 0)
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
                : m.emptyFolder,
        );
        entries.append(hint);
      }
    }
    entries.tabIndex = state.rows.length ? -1 : 0;
    if (focusedPath)
      (
        rowElement(focusedPath) ??
        rowElement(focusPath ?? "") ??
        entries
      ).focus();
    label(status, (m) =>
      state.rootLoading
        ? m.readingDirectory
        : state.error
          ? m.directoryUnavailable(state.error)
          : m.entries(state.rows.length, state.truncated),
    );
  }
  const tree = createFilesTree(request, render);
  state = tree.snapshot();
  function navigate(path: string) {
    navigationRevision++;
    closeMenu(false);
    return tree.navigate(path);
  }
  async function navigateFrom(operation: "home" | "terminal-directory") {
    const revision = ++navigationRevision;
    const reply = await request({ operation });
    if (revision !== navigationRevision) return;
    if (reply.directory) await navigate(reply.directory);
    else report(reply);
  }
  function rowKey(event: KeyboardEvent, item: FilesTreeRow) {
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
        if (!mutationPending) rename(item);
        break;
      case "ContextMenu":
        openMenu(item, undefined, undefined, rowElement(item.path));
        break;
      case "F10":
        if (event.shiftKey)
          openMenu(item, undefined, undefined, rowElement(item.path));
        else return;
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
    if (confirmation)
      void request({ operation: "cancel-delete", token: confirmation });
    confirmation = undefined;
  }
  function dismissEditor() {
    discardConfirmation();
    editor.hidden = true;
    (rowElement(selected?.path ?? "") ?? actionsButton).focus();
  }
  async function mutate(value: unknown) {
    if (mutationPending) return;
    mutationPending = true;
    discardConfirmation();
    editor.inert = true;
    message((m) => m.pending);
    try {
      const reply = await request(value);
      if (reply.ok) {
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
        if (editor.contains(document.activeElement))
          (rowElement(selected?.path ?? "") ?? actionsButton).focus();
      } else report(reply);
    } finally {
      mutationPending = false;
      editor.inert = false;
    }
  }
  function form(
    caption: Label,
    initial: string,
    submit: (value: string) => void,
  ) {
    if (mutationPending) return;
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
  async function prepareDelete(target: Target) {
    if (mutationPending) return;
    discardConfirmation();
    const revision = editorRevision;
    const reply = await request({
      operation: "prepare-delete",
      path: target.path,
    });
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
    confirm.focus();
  }
  function actions(target?: Target): Action[] {
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
        disabled: !directory || mutationPending,
      },
      {
        label: (m) => m.newFolder,
        run: () => creation("create-directory", directory),
        disabled: !directory || mutationPending,
      },
      ...(target
        ? [
            {
              label: (m: FilesMessages) => m.rename,
              run: () => rename(target),
              disabled: mutationPending,
            },
            {
              label: (m: FilesMessages) => m.trash,
              run: () => {
                void mutate({ operation: "trash", path: target.path });
              },
              disabled: mutationPending,
            },
            {
              label: (m: FilesMessages) => m.prepareDelete,
              run: () => {
                void prepareDelete(target);
              },
              disabled: mutationPending,
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
        run: () => {
          void navigateFrom("terminal-directory");
        },
      },
    ];
  }
  function closeMenu(restore = true) {
    if (menu.hidden) return;
    menu.hidden = true;
    actionsButton.setAttribute("aria-expanded", "false");
    if (restore)
      (menuReturn?.isConnected
        ? menuReturn
        : (rowElement(selected?.path ?? "") ?? actionsButton)
      )?.focus();
  }
  function openMenu(
    target?: Target,
    x?: number,
    y?: number,
    anchor?: HTMLElement,
  ) {
    menuReturn = anchor ?? actionsButton;
    clear(menu);
    label(menu, (m) => m.fileActions, "aria-label");
    for (const action of actions(target)) {
      const item = button(
        action.label,
        () => {
          closeMenu();
          action.run();
        },
        menu,
      );
      item.setAttribute("role", "menuitem");
      item.disabled = !!action.disabled;
      item.tabIndex = -1;
    }
    menu.hidden = false;
    actionsButton.setAttribute("aria-expanded", "true");
    const rect = menuReturn.getBoundingClientRect();
    const viewport = document.documentElement;
    menu.style.left = `${Math.max(0, Math.min(x ?? rect.left, viewport.clientWidth - menu.offsetWidth))}px`;
    menu.style.top = `${Math.max(0, Math.min(y ?? rect.bottom, viewport.clientHeight - menu.offsetHeight))}px`;
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }
  menu.addEventListener("keydown", (event) => {
    const items = [
      ...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    ];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
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
      items[next]?.focus();
    }
  });
  const dismissMenu = (event: PointerEvent) => {
    if (!menu.contains(event.target as Node)) closeMenu(false);
  };
  document.addEventListener("pointerdown", dismissMenu);
  entries.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    openMenu(undefined, event.clientX, event.clientY, entries);
  });
  entries.addEventListener("keydown", (event) => {
    if (
      event.key === "ContextMenu" ||
      (event.key === "F10" && event.shiftKey)
    ) {
      event.preventDefault();
      openMenu(undefined, undefined, undefined, entries);
    }
  });
  editor.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !mutationPending) {
      event.preventDefault();
      dismissEditor();
    }
  });
  button(
    (m) => m.home,
    () => {
      void navigateFrom("home");
    },
  );
  button(
    (m) => m.up,
    () => {
      if (state.root) void navigate(parent(state.root));
    },
  );
  button(
    (m) => m.refresh,
    () => {
      void tree.refresh();
    },
  );
  button(
    (m) => m.newFolder,
    () => creation("create-directory"),
  );
  const actionsButton = button(
    (m) => m.actions,
    () => openMenu(selected),
  );
  actionsButton.setAttribute("aria-haspopup", "menu");
  actionsButton.setAttribute("aria-expanded", "false");
  const go = createPageButton(document);
  go.type = "submit";
  label(go, (m) => m.go);
  location.append(address, go);
  location.addEventListener("submit", (event) => {
    event.preventDefault();
    void navigate(address.value);
  });
  content.append(toolbar, location, entries);
  document.body.append(
    createApplicationPage(document, { title, notice, content, status }),
    editor,
    menu,
  );
  // Native Escape belongs to the companion host, not this DOM menu. Hiding
  // dismisses transient menus while operation drafts remain retained.
  const unsubscribeVisibility = bridge.onVisibility?.((visible) => {
    if (!visible) closeMenu(false);
  });
  document.documentElement.lang = "en-US";
  const unsubscribeLanguage = bridge.onLanguage?.((language) => {
    if (disposed) return;
    document.documentElement.lang = language;
    messages = filesMessages(language);
    for (const update of labels.values()) update();
  });
  const ready = navigateFrom("home");
  return {
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      navigationRevision++;
      discardConfirmation();
      unsubscribeVisibility?.();
      unsubscribeLanguage?.();
      labels.clear();
      document.removeEventListener("pointerdown", dismissMenu);
    },
  };
}
