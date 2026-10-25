// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTranslator } from "../../src/shared/i18n";
import type {
  SavedSessionsDocument,
  SshSessionDefinition,
} from "../../src/shared/saved-sessions";
import type { SessionsBridge } from "../../src/shared/terminal-bridge";
import {
  countSessionPanes,
  createSessionActivity,
  type OpenSessionPane,
} from "../../src/renderer/sessions/session-activity";
import {
  paneCountLine,
  sessionDetailLines,
  sessionStatus,
} from "../../src/renderer/sessions/session-details";
import { createSessionsPanel } from "../../src/renderer/sessions/sessions-panel";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

const pt = createTranslator("pt-BR");
const box: SshSessionDefinition = {
  id: "box",
  kind: "ssh",
  name: "Servidor",
  host: "192.168.0.121",
  port: 2222,
  user: "ruscher",
  authentication: "key",
  identityFile: "~/.ssh/id_ed25519",
  proxyJump: "bastion",
  x11: true,
  forwards: [{ kind: "dynamic", listenPort: 1080 }],
  folderId: "prod",
  lastUsedAt: Date.UTC(2026, 9, 25, 15, 0),
};
const document_: SavedSessionsDocument = {
  folders: [{ id: "prod", name: "Produção" }],
  sessions: [
    box,
    { id: "logs", kind: "local", name: "Logs", workingDirectory: "/var/log" },
  ],
};

const pane = (
  spec: OpenSessionPane["launch"]["spec"],
  ended = false,
  tabNumber = 1,
): OpenSessionPane => ({
  launch: spec ? { spec } : {},
  title: "ruscher@box:~",
  ended,
  tabNumber,
  paneNumber: 1,
  paneCount: 1,
});

describe("Session details", () => {
  it("lists the definition's facts, never secrets", () => {
    expect(sessionDetailLines(box, document_, pt).slice(0, 9)).toEqual([
      "Tipo: SSH",
      "Pasta: Produção",
      "Host: 192.168.0.121",
      "Porta: 2222",
      "Usuário: ruscher",
      "Autenticação: Arquivo de chave privada",
      "Arquivo de chave privada: ~/.ssh/id_ed25519",
      "Host de salto (ProxyJump): bastion",
      "Opções: Encaminhar X11",
    ]);
    expect(sessionDetailLines(box, document_, pt)).toContain(
      "Encaminhamento de portas: 1",
    );
    expect(
      sessionDetailLines(box, document_, pt).some((line) =>
        line.startsWith("Último uso: "),
      ),
    ).toBe(true);
    expect(sessionDetailLines(document_.sessions[1]!, document_, pt)).toEqual([
      "Tipo: Local",
      "Diretório de trabalho: /var/log",
    ]);
  });

  it("colors green while a pane runs, red when all ended, grey when none", () => {
    expect(sessionStatus({ open: 2, running: 1 })).toBe("connected");
    expect(sessionStatus({ open: 1, running: 0 })).toBe("disconnected");
    expect(sessionStatus({ open: 0, running: 0 })).toBe("idle");
    expect(paneCountLine({ open: 2, running: 1 }, pt)).toBe(
      "Abertas nesta janela: 2 (1 conectada(s), 1 desconectada(s))",
    );
    expect(
      countSessionPanes([
        pane({ kind: "saved-session", id: "box" }),
        pane({ kind: "saved-session", id: "box" }, true),
        pane({ kind: "quick-ssh", target: "db" }),
        pane(undefined),
      ]),
    ).toEqual(new Map([["box", { open: 2, running: 1 }]]));
  });
});

function sessionsBridge(): SessionsBridge {
  return {
    list: vi.fn(async () => document_),
    saveSession: vi.fn(),
    deleteSession: vi.fn(),
    saveFolder: vi.fn(),
    deleteFolder: vi.fn(),
    importSshConfig: vi.fn(),
    importFile: vi.fn(),
    exportFile: vi.fn(),
    chooseFile: vi.fn(),
    onChanged: () => () => {},
    onToggleSidebar: () => () => {},
    startupConnection: vi.fn(async () => null),
    passwordState: vi.fn(),
    setPassword: vi.fn(),
    forgetHostKey: vi.fn(),
  } as unknown as SessionsBridge;
}

describe("SSH tabs", () => {
  it("describes SSH panes for the tab tooltip, and nothing else", async () => {
    const activity = createSessionActivity(sessionsBridge(), pt);
    await vi.waitFor(() =>
      expect(activity.definitions().sessions).toHaveLength(2),
    );
    const tooltip = activity
      .describeRemote({
        launch: { spec: { kind: "saved-session", id: "box" } },
        title: "ruscher@box:~/projetos",
        ended: false,
        startedAt: Date.UTC(2026, 9, 25, 15, 42),
      })!
      .tooltip.split("\n");
    expect(tooltip.slice(0, 4)).toEqual([
      "Sessão SSH: Servidor",
      "Título: ruscher@box:~/projetos",
      "Conexão: ruscher@192.168.0.121:2222",
      "Pasta: Produção",
    ]);
    expect(tooltip.at(-1)).toMatch(/^Conectada desde /u);
    expect(
      activity
        .describeRemote({
          launch: { spec: { kind: "quick-ssh", target: "admin@db" } },
          title: "admin@db:~",
          ended: true,
        })!
        .tooltip.split("\n"),
    ).toEqual([
      "SSH: Conexão Rápida",
      "Título: admin@db:~",
      "Conexão: admin@db",
      "Desconectada",
    ]);
    expect(
      activity.describeRemote({
        launch: { spec: { kind: "saved-session", id: "logs" } },
        title: "logs",
        ended: false,
      }),
    ).toBeUndefined();
    expect(
      activity.describeRemote({ launch: {}, title: "bash", ended: false }),
    ).toBeUndefined();
    activity.dispose();
  });

  it("shows a server icon and the tooltip on SSH tabs, keeping the title", async () => {
    const spec = { kind: "saved-session", id: "box" } as const;
    const onPanesChange = vi.fn();
    const harness = createTabsHarness({
      initialLaunch: { spec, label: "Servidor", retainOnExit: true },
      describeRemote: (described) =>
        described.launch.spec?.kind === "saved-session"
          ? { tooltip: `SSH\n${described.title}` }
          : undefined,
      onPanesChange,
    });
    await harness.tabs.ready;
    harness.tabs.openLaunch({}, "tab");
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
    harness.tabs.setSessionTitle("s1", "ruscher@box:~");
    const [ssh, local] = harness.strip.querySelectorAll("button");
    expect(ssh!.querySelector("svg.tab-remote-icon")).not.toBeNull();
    expect(ssh!.textContent).toBe("ruscher@box:~");
    expect(ssh!.title).toBe("SSH\nruscher@box:~");
    expect(local!.querySelector("svg.tab-remote-icon")).toBeNull();
    expect(onPanesChange).toHaveBeenCalled();
  });

  it("lists open panes with their state and reveals one", async () => {
    const spec = { kind: "saved-session", id: "box" } as const;
    const harness = createTabsHarness({
      initialLaunch: { spec, label: "Servidor", retainOnExit: true },
    });
    await harness.tabs.ready;
    harness.tabs.openLaunch({}, "tab");
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
    harness.adapters[0]!.handlers!.onExit({ exitCode: 255, signal: 0 });
    const open = harness.tabs.openSessions();
    expect(
      open.map(({ launch, ended, tabNumber, paneNumber, paneCount }) => ({
        spec: launch.spec,
        ended,
        tabNumber,
        paneNumber,
        paneCount,
      })),
    ).toEqual([
      { spec, ended: true, tabNumber: 1, paneNumber: 1, paneCount: 1 },
      {
        spec: undefined,
        ended: false,
        tabNumber: 2,
        paneNumber: 1,
        paneCount: 1,
      },
    ]);
    expect(open[1]!.startedAt).toEqual(expect.any(Number));
    harness.surfaces[0]!.focus.mockClear();
    harness.tabs.revealPane(1, 1);
    expect(harness.notifySelection).toHaveBeenLastCalledWith("s1");
    expect(harness.surfaces[0]!.focus).toHaveBeenCalled();
  });
});

describe("Sessions status dots and open-pane menu", () => {
  it("shows the state and count after the name and updates in place", async () => {
    document.body.innerHTML = "";
    let panes: OpenSessionPane[] = [
      pane({ kind: "saved-session", id: "box" }),
      pane({ kind: "saved-session", id: "box" }, false, 2),
    ];
    let changed: (() => void) | undefined;
    const reveal = vi.fn();
    const panel = createSessionsPanel(document, {
      translator: pt,
      bridge: sessionsBridge(),
      open: vi.fn(),
      notify: vi.fn(),
      openPanes: {
        list: () => panes,
        reveal,
        subscribe: (listener) => {
          changed = listener;
          return () => {};
        },
      },
    });
    document.body.append(panel.element);
    const row = await vi.waitFor(() => {
      const element = panel.element.querySelector<HTMLElement>(
        '.sessions-row.session[data-session-id="box"]',
      );
      if (!element) throw new Error("not rendered yet");
      return element;
    });
    const dot = () => row.querySelector<HTMLElement>(".sessions-status")!;
    expect(dot().dataset.state).toBe("connected");
    expect(dot().textContent).toBe("2");
    expect(dot().getAttribute("aria-label")).toBe(
      "2 aberta(s) nesta janela, 2 conectada(s)",
    );
    expect(dot().previousElementSibling!.textContent).toBe("Servidor");
    expect(row.title.split("\n")).toEqual(
      expect.arrayContaining([
        "Servidor",
        "Tipo: SSH",
        "Porta: 2222",
        "Abertas nesta janela: 2 (2 conectada(s), 0 desconectada(s))",
      ]),
    );

    panes = [pane({ kind: "saved-session", id: "box" }, true)];
    changed!();
    expect(dot().dataset.state).toBe("disconnected");
    expect(dot().textContent).toBe("1");
    panes = [];
    changed!();
    expect(dot().dataset.state).toBe("idle");
    expect(dot().textContent).toBe("");
    expect(
      panel.element.querySelector(
        '.sessions-row.session[data-session-id="box"]',
      ),
    ).toBe(row);

    panes = [
      pane({ kind: "saved-session", id: "box" }, false, 3),
      pane({ kind: "saved-session", id: "box" }, true, 4),
    ];
    changed!();
    row.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, clientX: 5, clientY: 5 }),
    );
    const items = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '.omx-context-menu [role="menuitem"]',
      ),
    ];
    expect(items.slice(0, 3).map((item) => item.textContent)).toEqual([
      "Abertas nesta janela",
      "Aba 3: ruscher@box:~",
      "Aba 4: ruscher@box:~ (desconectada)",
    ]);
    expect(items[0]!.disabled).toBe(true);
    items[2]!.click();
    expect(reveal).toHaveBeenCalledExactlyOnceWith(panes[1]);
    panel.dispose();
  });
});
