import type { DirectoryListing, FileEntry } from "../../shared/file-browser";
import type { Translator } from "../../shared/i18n";
import type { FilesBridge } from "../../shared/terminal-bridge";
import type { TerminalSessionId } from "../../shared/terminal-contract";
import type { DirectoryTracker } from "./directory-tracker";
import { createFilesActions } from "./files-actions";
import { createFilesList, isDirectoryLike, sortEntries } from "./files-list";
import {
  createSourceResolver,
  localFilesSource,
  type FilesSource,
} from "./files-source";
import { createTransfersView } from "./files-transfers";
import { createFilesChrome } from "./files-chrome";

export interface FilesPanelOptions {
  readonly translator: Translator;
  readonly bridge: FilesBridge;
  readonly directories: DirectoryTracker;
  readonly notify: (message: string) => void;
  // Types into the focused pane; submit also presses Enter.
  readonly typeInTerminal: (text: string, submit: boolean) => void;
  readonly copyText: (text: string) => void;
  readonly focusedSessionId: () => TerminalSessionId | undefined;
  // The focused pane's local directory, when it can be known.
  readonly focusedDirectory: () => Promise<string | null>;
}

export interface FilesPanel {
  readonly element: HTMLElement;
  activate(): void;
  dispose(): void;
}

const FOLLOW_INTERVAL_MS = 1_500;

// Electron prefixes errors thrown by main handlers; the panel shows only the
// message main wrote.
function mainMessage(cause: unknown, fallback: string): string {
  if (!(cause instanceof Error)) return fallback;
  return cause.message.replace(
    /^Error invoking remote method '[^']+': (?:\w*Error: )?/u,
    "",
  );
}

// AshyTerm's integrated file manager. With a local pane focused it browses
// the local file system and follows the shell's directory; with an SSH pane
// focused it browses that host over SFTP. Items open, rename, move, delete,
// download and upload through main.
export function createFilesPanel(
  document: Document,
  options: FilesPanelOptions,
): FilesPanel {
  const { translator, bridge } = options;
  const t = translator.t.bind(translator);
  let local: FilesSource | undefined;
  let source: FilesSource | undefined;
  let listing: DirectoryListing | undefined;
  // The last remote directory per SSH pane, to return to it.
  const remoteDirectories = new Map<TerminalSessionId, string>();
  let follow = true;
  let showHidden = false;
  let disposed = false;
  let started = false;
  let loading = 0;

  const element = document.createElement("section");
  element.className = "files-panel";
  element.setAttribute("aria-label", t("sidebar.files"));
  const chrome = createFilesChrome(document, translator, () => disposed);
  const { place, filter, status } = chrome;
  const transfers = createTransfersView(
    document,
    translator,
    (id) => void bridge.cancelTransfer(id),
  );

  const join = (directory: string, name: string) => {
    const separator = source?.separator ?? "/";
    return directory.endsWith(separator)
      ? `${directory}${name}`
      : `${directory}${separator}${name}`;
  };
  const pathOf = (entry: FileEntry) => join(listing?.path ?? "/", entry.name);

  const visible = () => {
    const query = filter.value.trim().toLocaleLowerCase();
    return sortEntries(
      (listing?.entries ?? []).filter(
        (entry) =>
          (showHidden || !entry.name.startsWith(".")) &&
          (query === "" || entry.name.toLocaleLowerCase().includes(query)),
      ),
      translator.compare.bind(translator),
    );
  };
  const render = () => {
    const entries = visible();
    list.render(entries);
    chrome.renderCrumbs(
      listing?.path,
      source?.separator ?? "/",
      join,
      (target) => void navigate(target),
    );
    const label = source?.kind === "remote" ? source.label : undefined;
    place.hidden = label === undefined;
    place.textContent = label ? t("files.remote", { host: label }) : "";
    uploadButton.hidden = !source?.upload;
    status.textContent = listing?.truncated
      ? t("files.truncated", { count: entries.length })
      : t("common.items", { count: entries.length });
  };

  const navigate = async (directory: string, quiet = false) => {
    const current = source;
    if (!current) return;
    const request = (loading += 1);
    try {
      const next = await current.list(directory);
      if (disposed || request !== loading || current !== source) return;
      const changed = next.path !== listing?.path;
      listing = next;
      if (current.sessionId)
        remoteDirectories.set(current.sessionId, next.path);
      if (changed) filter.value = "";
      render();
    } catch (cause) {
      if (quiet || disposed) return;
      options.notify(
        current.kind === "remote"
          ? mainMessage(cause, t("files.cannotOpen"))
          : t("files.cannotOpen"),
      );
    }
  };
  // Shows another source, at its last or home directory.
  const switchTo = async (next: FilesSource) => {
    if (next === source) return false;
    source = next;
    listing = undefined;
    filter.value = "";
    render();
    let directory = next.sessionId
      ? remoteDirectories.get(next.sessionId)
      : undefined;
    try {
      directory ??= await next.home();
    } catch (cause) {
      options.notify(mainMessage(cause, t("files.cannotOpen")));
      return true;
    }
    if (source === next) await navigate(directory);
    return true;
  };
  const sourceFor = createSourceResolver(
    bridge,
    () => local!,
    t("files.copyUnsupported"),
  );

  // Local shells report directory changes with OSC 7 when set up to;
  // otherwise main reads the pane's process. A short poll while the panel
  // is visible covers shells that report nothing.
  const visibleNow = () =>
    element.isConnected && element.closest("[hidden]") === null;
  const followTerminal = async () => {
    if (!started || !follow || !visibleNow() || !local) return;
    const sessionId = options.focusedSessionId();
    const next = sessionId
      ? await sourceFor(sessionId).catch(() => local!)
      : local;
    if (await switchTo(next)) return;
    if (next.kind !== "local") return;
    const directory = await options.focusedDirectory().catch(() => null);
    if (directory && directory !== listing?.path)
      await navigate(directory, true);
  };

  const activate = (entry: FileEntry) => {
    if (isDirectoryLike(entry)) void navigate(pathOf(entry));
    else
      void source?.open(pathOf(entry)).then((result) => {
        if (!result.ok) options.notify(result.error);
      });
  };
  const actions = createFilesActions(document, {
    t,
    notify: options.notify,
    typeInTerminal: options.typeInTerminal,
    copyText: options.copyText,
    source: () => source,
    directory: () => listing?.path,
    pathOf,
    refresh: async () => {
      if (listing) await navigate(listing.path);
    },
    activate,
    focusList: () => list.focus(),
  });
  const list = createFilesList(document, translator, {
    activate,
    goUp: () => listing?.parent && void navigate(listing.parent),
    trash: (entries) => void actions.remove(entries),
    rename: (entry) => void actions.rename(entry),
    clipboard(action) {
      if (action === "paste") void actions.paste();
      else actions.hold(action === "copy" ? "copy" : "move", list.selected());
    },
    menu: actions.menu,
    typeAhead(text) {
      filter.value += text;
      filter.focus();
      render();
    },
  });
  list.element.addEventListener("contextmenu", (event) => {
    if (event.target !== list.element) return;
    event.preventDefault();
    actions.menu([], { x: event.clientX, y: event.clientY });
  });

  chrome.tool(
    "up",
    "files.up",
    () => listing?.parent && void navigate(listing.parent),
  );
  chrome.tool("home", "files.home", () => {
    void source?.home().then((home) => navigate(home));
  });
  chrome.tool("refresh", "common.refresh", () => {
    if (listing) void navigate(listing.path);
  });
  chrome.toggle("follow", "files.follow", true, (pressed) => {
    follow = pressed;
    if (follow) void followTerminal();
  });
  chrome.toggle("hidden", "files.showHidden", false, (pressed) => {
    showHidden = pressed;
    render();
  });
  chrome.tool(
    "newFolder",
    "files.newFolder",
    () => void actions.create("folder"),
  );
  chrome.tool("newFile", "files.newFile", () => void actions.create("file"));
  const uploadButton = chrome.tool(
    "send",
    "files.upload",
    () => void actions.upload(),
  );
  uploadButton.hidden = true;

  chrome.bindFilter(render, () => list.focus());
  element.append(
    chrome.toolbar,
    place,
    chrome.crumbs,
    filter,
    list.element,
    transfers.element,
    status,
  );
  const unsubscribe = options.directories.subscribe(
    () => void followTerminal(),
  );
  const removeTransfers = bridge.onTransfer((event) => {
    transfers.update(event);
    if (event.state === "done" && event.direction === "upload" && listing)
      void navigate(listing.path, true);
  });
  const poll = document.defaultView?.setInterval(
    () => void followTerminal(),
    FOLLOW_INTERVAL_MS,
  );

  const start = async () => {
    local = await localFilesSource(bridge);
    const sessionId = options.focusedSessionId();
    const focused = sessionId
      ? await sourceFor(sessionId).catch(() => local!)
      : local;
    if (focused.kind === "remote") {
      await switchTo(focused);
      return;
    }
    source = local;
    const directory = await options.focusedDirectory().catch(() => null);
    await navigate(directory ?? (await local.home()));
  };

  return {
    element,
    activate() {
      list.focus();
      if (started) {
        void followTerminal();
        return;
      }
      started = true;
      void start().catch(() => options.notify(t("files.cannotOpen")));
    },
    dispose() {
      disposed = true;
      unsubscribe();
      removeTransfers();
      document.defaultView?.clearInterval(poll);
    },
  };
}
