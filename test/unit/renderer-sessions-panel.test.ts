// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTranslator } from "../../src/shared/i18n";
import type { SavedSessionsDocument } from "../../src/shared/saved-sessions";
import type { SessionsBridge } from "../../src/shared/terminal-bridge";
import { createSessionsPanel } from "../../src/renderer/sessions/sessions-panel";
import { editSession } from "../../src/renderer/sessions/session-editor";
import { showContextMenu } from "../../src/renderer/ui/context-menu";

beforeAll(() => {
  // jsdom lacks modal dialogs; the panel only needs open/close semantics.
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

const translator = createTranslator("en");
const document_: SavedSessionsDocument = {
  folders: [{ id: "prod", name: "Production" }],
  sessions: [
    {
      id: "web",
      kind: "ssh",
      name: "web-1",
      host: "web1.example.com",
      user: "deploy",
      authentication: "agent",
      folderId: "prod",
      color: "#ff8800",
    },
    { id: "logs", kind: "local", name: "Logs", workingDirectory: "/var/log" },
  ],
};

function fakeBridge(initial = document_) {
  let changed: ((document: SavedSessionsDocument) => void) | undefined;
  const bridge: SessionsBridge = {
    list: vi.fn(async () => initial),
    saveSession: vi.fn(async (session) => session as never),
    deleteSession: vi.fn(async () => undefined),
    saveFolder: vi.fn(
      async (folder) => ({ id: "new", ...(folder as object) }) as never,
    ),
    deleteFolder: vi.fn(async () => undefined),
    importSshConfig: vi.fn(async () => ({ added: 2 })),
    importFile: vi.fn(async () => null),
    exportFile: vi.fn(async () => true),
    chooseFile: vi.fn(async () => "/home/me/.ssh/id_ed25519"),
    onChanged: (listener) => {
      changed = listener;
      return () => {
        changed = undefined;
      };
    },
    onToggleSidebar: () => () => {},
    startupConnection: vi.fn(async () => null),
    passwordState: vi.fn(async () => ({
      storage: "available" as const,
      saved: false,
    })),
    setPassword: vi.fn(async () => undefined),
    forgetHostKey: vi.fn(async () => ({ removed: true })),
  };
  return {
    bridge,
    emit: (document: SavedSessionsDocument) => changed?.(document),
  };
}

async function mountPanel(initial?: SavedSessionsDocument) {
  document.body.innerHTML = "";
  const { bridge, emit } = fakeBridge(initial);
  const open = vi.fn();
  const notify = vi.fn();
  const panel = createSessionsPanel(document, {
    translator,
    bridge,
    open,
    notify,
  });
  document.body.append(panel.element);
  await vi.waitFor(() =>
    expect(
      panel.element.querySelectorAll(".sessions-row").length,
    ).toBeGreaterThan(0),
  );
  return { panel, bridge, open, notify, emit };
}

const rowNames = (root: HTMLElement) =>
  [...root.querySelectorAll(".sessions-row .sessions-name")].map(
    (n) => n.textContent,
  );

describe("Sessions sidebar panel", () => {
  it("lists folders and sessions and expands a folder on click", async () => {
    const { panel } = await mountPanel();
    expect(rowNames(panel.element)).toEqual(["Production", "Logs"]);
    panel.element.querySelector<HTMLElement>("[data-folder-id=prod]")!.click();
    expect(rowNames(panel.element)).toEqual(["Production", "web-1", "Logs"]);
    expect(
      panel.element
        .querySelector("[data-folder-id=prod]")!
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("opens saved sessions as intents, never as commands", async () => {
    const { panel, open } = await mountPanel();
    const logs = panel.element.querySelector<HTMLElement>(
      "[data-session-id=logs]",
    )!;
    logs.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(open).toHaveBeenCalledWith(
      {
        spec: { kind: "saved-session", id: "logs" },
        label: "Logs",
        retainOnExit: true,
      },
      "tab",
    );
    logs.focus();
    logs.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: true,
        bubbles: true,
      }),
    );
    expect(open).toHaveBeenLastCalledWith(
      expect.objectContaining({ spec: { kind: "saved-session", id: "logs" } }),
      "split-right",
    );
  });

  it("validates Quick Connect targets before asking main", async () => {
    const { panel, open } = await mountPanel();
    const form = panel.element.querySelector("form")!;
    const input = form.querySelector("input")!;
    input.value = "-oProxyCommand=evil";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(open).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    input.value = "ops@db.internal:2222";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(open).toHaveBeenCalledWith(
      {
        spec: { kind: "quick-ssh", target: "ops@db.internal:2222" },
        label: "ops@db.internal:2222",
        retainOnExit: true,
      },
      "tab",
    );
    expect(input.value).toBe("");
  });

  it("filters by host and shows an empty state", async () => {
    const { panel } = await mountPanel();
    const search =
      panel.element.querySelector<HTMLInputElement>("input[type=search]")!;
    search.value = "web1";
    search.dispatchEvent(new Event("input"));
    expect(rowNames(panel.element)).toEqual(["Production", "web-1"]);
    search.value = "nothing-matches";
    search.dispatchEvent(new Event("input"));
    expect(rowNames(panel.element)).toEqual([]);
    expect(panel.element.querySelector(".sessions-empty")!.textContent).toBe(
      "No results match the search.",
    );
  });

  it("re-renders when main broadcasts a change, with favorites first", async () => {
    const { panel, emit } = await mountPanel();
    emit({
      ...document_,
      sessions: [
        { ...document_.sessions[1]!, favorite: true },
        document_.sessions[0]!,
      ],
    });
    expect(
      [...panel.element.querySelectorAll(".sessions-heading")].map(
        (h) => h.textContent,
      ),
    ).toEqual(["Favorites", "Sessions"]);
    expect(rowNames(panel.element)[0]).toBe("Logs");
  });
});

// The editor asks main about password storage before its dialog opens.
async function openedDialog() {
  return vi.waitFor(() => {
    const dialog = document.querySelector("dialog");
    if (!dialog) throw new Error("The editor has not opened yet");
    return dialog;
  });
}

describe("Saved Session editor", () => {
  it("builds a validated SSH candidate including forwards and options", async () => {
    document.body.innerHTML = "";
    const save = vi.fn(
      async (candidate: unknown) =>
        ({ id: "s1", ...(candidate as object) }) as never,
    );
    const pending = editSession({
      document,
      translator,
      sessions: document_,
      chooseFile: async () => null,
      save,
      passwordState: async () => ({ storage: "available", saved: false }),
      setPassword: vi.fn(async () => undefined),
    });
    const dialog = await openedDialog();
    const input = (label: string) =>
      [...dialog.querySelectorAll<HTMLElement>(".omx-field")]
        .find((field) => field.querySelector("label")?.textContent === label)!
        .querySelector<HTMLInputElement | HTMLTextAreaElement>(
          "input, textarea, select",
        )!;
    input("Name").value = "DB";
    input("Host").value = "db.internal";
    input("Port").value = "2222";
    input("Port forwarding").value = "L 5432:localhost:5432\nD 1080";
    input("Extra -o options").value = "ServerAliveCountMax=5";
    dialog.querySelector<HTMLButtonElement>(".omx-button-primary")!.click();
    await expect(pending).resolves.toBe(true);
    expect(save).toHaveBeenCalledWith({
      kind: "ssh",
      name: "DB",
      host: "db.internal",
      port: 2222,
      authentication: "agent",
      forwards: [
        { kind: "local", listenPort: 5432, host: "localhost", hostPort: 5432 },
        { kind: "dynamic", listenPort: 1080 },
      ],
      options: ["ServerAliveCountMax=5"],
    });
  });

  it("keeps the dialog open with field errors for invalid values", async () => {
    document.body.innerHTML = "";
    const save = vi.fn(
      async (candidate: unknown) =>
        ({ id: "s1", ...(candidate as object) }) as never,
    );
    void editSession({
      document,
      translator,
      sessions: document_,
      chooseFile: async () => null,
      save,
      passwordState: async () => ({ storage: "available", saved: false }),
      setPassword: vi.fn(async () => undefined),
    });
    const dialog = await openedDialog();
    const fields = [...dialog.querySelectorAll<HTMLElement>(".omx-field")];
    const named = (label: string) =>
      fields.find(
        (field) => field.querySelector("label")?.textContent === label,
      )!;
    named("Name").querySelector("input")!.value = "Bad";
    named("Host").querySelector("input")!.value = "-oProxyCommand=x";
    dialog.querySelector<HTMLButtonElement>(".omx-button-primary")!.click();
    await vi.waitFor(() =>
      expect(named("Host").querySelector(".omx-field-error")!.textContent).toBe(
        "Enter a host name without spaces.",
      ),
    );
    named("Port forwarding").querySelector("textarea")!.value = "nonsense";
    named("Host").querySelector("input")!.value = "ok.example";
    dialog.querySelector<HTMLButtonElement>(".omx-button-primary")!.click();
    await vi.waitFor(() =>
      expect(
        named("Port forwarding").querySelector(".omx-field-error")!.textContent,
      ).toBe("Line 1 is not a valid forwarding rule."),
    );
    expect(save).not.toHaveBeenCalled();
    expect(dialog.hasAttribute("open")).toBe(true);
  });
});

describe("context menu", () => {
  it("activates items by keyboard and closes on Escape", () => {
    document.body.innerHTML = "";
    const first = vi.fn();
    const second = vi.fn();
    showContextMenu(document, { x: 10, y: 10 }, [
      { label: "One", action: first },
      { separator: true },
      { label: "Two", action: second, danger: true },
    ]);
    const menu = document.querySelector<HTMLElement>(".omx-context-menu")!;
    expect(document.activeElement?.textContent).toBe("One");
    menu.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(document.activeElement?.textContent).toBe("Two");
    (document.activeElement as HTMLButtonElement).click();
    expect(second).toHaveBeenCalledOnce();
    expect(document.querySelector(".omx-context-menu")).toBeNull();
    showContextMenu(document, { x: 0, y: 0 }, [
      { label: "One", action: first },
    ]);
    document
      .querySelector(".omx-context-menu")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    expect(document.querySelector(".omx-context-menu")).toBeNull();
    expect(first).not.toHaveBeenCalled();
  });
});
