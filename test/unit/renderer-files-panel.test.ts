// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createFilesPanel } from "../../src/renderer/files/files-panel";
import { createDirectoryTracker } from "../../src/renderer/files/directory-tracker";
import { createTranslator } from "../../src/shared/i18n";
import type {
  DirectoryListing,
  FileEntry,
  TransferEvent,
} from "../../src/shared/file-browser";
import type { FilesBridge } from "../../src/shared/terminal-bridge";

const entry = (name: string, kind: FileEntry["kind"] = "file"): FileEntry => ({
  name,
  kind,
  size: 2048,
  modified: 0,
  mode: "rw-r--r--",
});

const listings: Record<string, DirectoryListing> = {
  "/home/me": {
    path: "/home/me",
    parent: "/home",
    entries: [
      entry("zeta.txt"),
      entry("Alpha", "directory"),
      entry(".hidden"),
      entry("beta.md"),
    ],
    truncated: false,
  },
  "/home/me/Alpha": {
    path: "/home/me/Alpha",
    parent: "/home/me",
    entries: [entry("inside.txt")],
    truncated: false,
  },
  "/srv": {
    path: "/srv",
    parent: "/",
    entries: [entry("site", "directory"), entry("app.log")],
    truncated: false,
  },
};

function bridge(remoteSessions: string[] = []) {
  let transfer: ((event: TransferEvent) => void) | undefined;
  const ok = async () => ({ ok: true as const });
  const fake: FilesBridge = {
    peek: vi.fn(async () => null),
    home: vi.fn(async () => ({
      home: "/home/me",
      platform: "linux",
      separator: "/" as const,
    })),
    list: vi.fn(async (directory: string) => listings[directory]!),
    resolve: vi.fn(async () => null),
    open: vi.fn(ok),
    reveal: vi.fn(ok),
    createFolder: vi.fn(ok),
    createFile: vi.fn(ok),
    rename: vi.fn(ok),
    trash: vi.fn(ok),
    transfer: vi.fn(ok),
    onToggle: () => () => {},
    location: vi.fn(async (sessionId: string) =>
      remoteSessions.includes(sessionId)
        ? { kind: "remote" as const, label: "admin@server" }
        : { kind: "local" as const },
    ),
    remoteHome: vi.fn(async () => "/srv"),
    remoteList: vi.fn(
      async (_id: string, directory: string) => listings[directory]!,
    ),
    remoteCreateFolder: vi.fn(ok),
    remoteCreateFile: vi.fn(ok),
    remoteRename: vi.fn(ok),
    remoteMove: vi.fn(ok),
    remoteDelete: vi.fn(ok),
    remoteDownload: vi.fn(ok),
    remoteUpload: vi.fn(ok),
    remoteEdit: vi.fn(ok),
    cancelTransfer: vi.fn(async () => {}),
    onTransfer(listener) {
      transfer = listener;
      return () => {
        transfer = undefined;
      };
    },
  };
  return { fake, emit: (event: TransferEvent) => transfer?.(event) };
}

const flush = async () => {
  for (let count = 0; count < 5; count += 1)
    await new Promise((resolve) => setTimeout(resolve, 0));
};

function mount(
  fake: FilesBridge,
  focused: { id: string | undefined; directory: string | null },
) {
  const typed: [string, boolean][] = [];
  const keys_: string[] = [];
  const panel = createFilesPanel(document, {
    translator: createTranslator("en"),
    bridge: fake,
    directories: createDirectoryTracker(() => focused.id),
    notify: vi.fn(),
    typeInTerminal: (text, submit) => typed.push([text, submit]),
    copyText: vi.fn(),
    focusedSessionId: () => focused.id,
    focusedPane: async () => ({ directory: focused.directory, busy: false }),
    sendKeys: (keys) => keys_.push(keys),
    runCommand: (command) => typed.push([command, true]),
  });
  document.body.append(panel.element);
  panel.activate();
  return { panel, typed, keys: keys_ };
}

const names = () =>
  [...document.querySelectorAll(".files-row .files-name")].map(
    (name) => name.textContent,
  );
const row = (name: string) =>
  [...document.querySelectorAll<HTMLElement>(".files-row")].find(
    (item) => item.querySelector(".files-name")!.textContent === name,
  )!;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("Files panel", () => {
  it("lists folders first, hides dotfiles and filters", async () => {
    const { fake } = bridge();
    mount(fake, { id: "s1", directory: "/home/me" });
    await flush();
    expect(names()).toEqual(["Alpha", "beta.md", "zeta.txt"]);
    document
      .querySelector<HTMLButtonElement>('[aria-label="Show Hidden Files"]')!
      .click();
    expect(names()).toContain(".hidden");
    const filter = document.querySelector<HTMLInputElement>(".files-filter")!;
    filter.value = "ET";
    filter.dispatchEvent(new Event("input"));
    expect(names()).toEqual(["beta.md", "zeta.txt"]);
    expect(
      [...document.querySelectorAll(".files-crumbs button")].map(
        (crumb) => crumb.textContent,
      ),
    ).toEqual(["/", "home", "me"]);
  });

  it("opens folders in the panel and files with the default application", async () => {
    const { fake } = bridge();
    mount(fake, { id: "s1", directory: "/home/me" });
    await flush();
    row("Alpha").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await flush();
    expect(names()).toEqual(["inside.txt"]);
    const list = document.querySelector<HTMLElement>(".files-list")!;
    list.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(fake.open).toHaveBeenCalledWith("/home/me/Alpha/inside.txt");
    list.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }),
    );
    await flush();
    expect(names()).toContain("Alpha");
  });

  it("asks before moving items to the trash", async () => {
    const { fake } = bridge();
    mount(fake, { id: "s1", directory: "/home/me" });
    await flush();
    row("beta.md").dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
    document
      .querySelector(".files-list")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
      );
    await flush();
    expect(document.querySelector(".omx-modal p")!.textContent).toBe(
      "Move “beta.md” to the trash?",
    );
    document.querySelector<HTMLButtonElement>(".omx-button-danger")!.click();
    await flush();
    expect(fake.trash).toHaveBeenCalledWith(["/home/me/beta.md"]);
  });

  it("types quoted paths into the terminal from the menu", async () => {
    const { fake } = bridge();
    const { typed } = mount(fake, { id: "s1", directory: "/home/me" });
    await flush();
    row("Alpha").dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, clientX: 5, clientY: 5 }),
    );
    const item = (label: string) =>
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          ".omx-context-menu button",
        ),
      ].find((button) => button.textContent === label)!;
    item("Open in Terminal").click();
    expect(typed).toEqual([["cd -- '/home/me/Alpha'", true]]);
  });

  it("browses an SSH pane over SFTP with permanent deletion", async () => {
    const { fake, emit } = bridge(["s2"]);
    mount(fake, { id: "s2", directory: null });
    await flush();
    expect(document.querySelector(".files-place")!.textContent).toBe(
      "SFTP · admin@server",
    );
    expect(names()).toEqual(["site", "app.log"]);
    expect(
      document.querySelector<HTMLElement>('[aria-label="Upload Files…"]')!
        .hidden,
    ).toBe(false);
    row("app.log").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(fake.remoteEdit).toHaveBeenCalledWith("s2", "/srv/app.log");
    row("app.log").dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
    document
      .querySelector(".files-list")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
      );
    await flush();
    expect(document.querySelector(".omx-modal h2")!.textContent).toBe(
      "Delete Permanently?",
    );
    document.querySelector<HTMLButtonElement>(".omx-button-danger")!.click();
    await flush();
    expect(fake.remoteDelete).toHaveBeenCalledWith("s2", ["/srv/app.log"]);
    expect(fake.trash).not.toHaveBeenCalled();

    emit({
      id: "t1",
      name: "app.log",
      direction: "download",
      transferred: 1024,
      total: 2048,
      state: "running",
    });
    const transfer = document.querySelector(".files-transfer")!;
    expect(transfer.textContent).toContain("app.log · 1 KB / 2 KB");
    transfer.querySelector<HTMLButtonElement>("button")!.click();
    expect(fake.cancelTransfer).toHaveBeenCalledWith("t1");
  });
});
