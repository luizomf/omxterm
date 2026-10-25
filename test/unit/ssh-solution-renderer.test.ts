// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTranslator } from "../../src/shared/i18n";
import type { SshSessionDefinition } from "../../src/shared/saved-sessions";
import { sshSolution } from "../../src/renderer/sessions/ssh-solution";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

const CHANGED = [
  "@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @",
  "The fingerprint for the ED25519 key sent by the remote host is",
  "SHA256:ciXGnVCNSj+wvn+AqFpb5fVZ5J2cvthQfeHIWwQTeOA.",
  "Offending ECDSA key in /home/ruscher/.ssh/known_hosts:148",
  "Host key verification failed.",
].join("\r\n");

const box: SshSessionDefinition = {
  id: "box",
  kind: "ssh",
  name: "Box",
  host: "192.168.0.121",
  user: "ruscher",
  authentication: "agent",
};

function bridge(sessions: SshSessionDefinition[] = [box]) {
  return {
    list: vi.fn(async () => ({ folders: [], sessions })),
    saveSession: vi.fn(async (value: unknown) => value as never),
    forgetHostKey: vi.fn(async () => ({ removed: true })),
  };
}

async function dialog() {
  return vi.waitFor(() => {
    const element = document.querySelector<HTMLDialogElement>("dialog[open]");
    if (!element) throw new Error("not open yet");
    return element;
  });
}
const button = (element: HTMLElement, label: string) =>
  [...element.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  )!;

describe("Solution button on the ended banner", () => {
  it("appears beside Reconnect and Close only when ssh exits with 255", async () => {
    let reconnectPane: (() => void) | undefined;
    const endedSolution = vi.fn(
      (_launch: unknown, _output: string, reconnect: () => void) => {
        reconnectPane = reconnect;
      },
    );
    const spec = { kind: "saved-session", id: "box" } as const;
    const harness = createTabsHarness({
      initialLaunch: { spec, label: "Box", retainOnExit: true },
      endedSolution,
    });
    await harness.tabs.ready;
    harness.adapters[0]!.handlers!.onExit({ exitCode: 255, signal: 0 });
    const banner =
      harness.container.querySelector<HTMLElement>(".pane-ended-banner")!;
    expect(
      [...banner.querySelectorAll("button")].map((item) => item.textContent),
    ).toEqual(["Reconnect", "Close", "Solution"]);
    button(banner, "Solution").click();
    expect(endedSolution).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ spec }),
      expect.any(String),
      expect.any(Function),
    );
    // The reconnect it receives replaces the pane, like the banner's own.
    reconnectPane!();
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
  });

  it("is absent for other exit codes", async () => {
    const harness = createTabsHarness({
      initialLaunch: {
        spec: { kind: "quick-ssh", target: "db" },
        retainOnExit: true,
      },
      endedSolution: vi.fn(),
    });
    await harness.tabs.ready;
    harness.adapters[0]!.handlers!.onExit({ exitCode: 1, signal: 0 });
    const banner = harness.container.querySelector(".pane-ended-banner")!;
    expect(banner.textContent).not.toContain("Solution");
  });
});

describe("SSH Solution dialog", () => {
  const translator = createTranslator("pt-BR");

  it("shows the fingerprint and removes the old key only on request, then reconnects", async () => {
    document.body.innerHTML = "";
    const sessions = bridge();
    const reconnect = vi.fn();
    sshSolution(document, sessions, translator)(
      { spec: { kind: "saved-session", id: "box" } },
      CHANGED,
      reconnect,
    );
    const open = await dialog();
    expect(open.textContent).toContain(
      "A identificação do computador remoto mudou",
    );
    expect(open.textContent).toContain("ruscher@192.168.0.121");
    expect(open.textContent).toContain(
      "SHA256:ciXGnVCNSj+wvn+AqFpb5fVZ5J2cvthQfeHIWwQTeOA",
    );
    expect(sessions.forgetHostKey).not.toHaveBeenCalled();
    button(open, "Remover a chave antiga e reconectar").click();
    await vi.waitFor(() => expect(reconnect).toHaveBeenCalledOnce());
    expect(sessions.forgetHostKey).toHaveBeenCalledExactlyOnceWith({
      kind: "saved-session",
      id: "box",
    });
  });

  it("does nothing when cancelled", async () => {
    document.body.innerHTML = "";
    const sessions = bridge();
    const reconnect = vi.fn();
    sshSolution(document, sessions, translator)(
      { spec: { kind: "saved-session", id: "box" } },
      CHANGED,
      reconnect,
    );
    button(await dialog(), "Cancelar").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sessions.forgetHostKey).not.toHaveBeenCalled();
    expect(reconnect).not.toHaveBeenCalled();
  });

  it("keeps the dialog open with manual instructions when removal fails", async () => {
    document.body.innerHTML = "";
    const sessions = bridge();
    sessions.forgetHostKey.mockRejectedValueOnce(new Error("no ssh-keygen"));
    const reconnect = vi.fn();
    sshSolution(document, sessions, translator)(
      { spec: { kind: "quick-ssh", target: "admin@db.lan:2222" } },
      CHANGED,
      reconnect,
    );
    const open = await dialog();
    button(open, "Remover a chave antiga e reconectar").click();
    await vi.waitFor(() =>
      expect(open.querySelector(".ssh-solution-status")!.textContent).toBe(
        "Não foi possível atualizar o known_hosts. Remova a chave antiga num terminal com: ssh-keygen -R [db.lan]:2222",
      ),
    );
    expect(open.hasAttribute("open")).toBe(true);
    expect(reconnect).not.toHaveBeenCalled();
  });

  it("never offers removal for a key in a system-wide file", async () => {
    document.body.innerHTML = "";
    sshSolution(document, bridge(), translator)(
      { spec: { kind: "saved-session", id: "box" } },
      CHANGED.replace(
        "/home/ruscher/.ssh/known_hosts:148",
        "/etc/ssh/ssh_known_hosts:3",
      ),
      vi.fn(),
    );
    const open = await dialog();
    expect(open.textContent).toContain(
      "ssh-keygen -R 192.168.0.121 -f /etc/ssh/ssh_known_hosts",
    );
    expect(button(open, "Remover a chave antiga e reconectar")).toBeUndefined();
  });

  it("offers a prompted password after a refused sign-in", async () => {
    document.body.innerHTML = "";
    const sessions = bridge();
    const reconnect = vi.fn();
    sshSolution(document, sessions, translator)(
      { spec: { kind: "saved-session", id: "box" } },
      "ruscher@192.168.0.121: Permission denied (publickey).\r\n",
      reconnect,
    );
    const open = await dialog();
    expect(open.textContent).toContain("O login foi recusado");
    button(open, "Usar senha e reconectar").click();
    await vi.waitFor(() => expect(reconnect).toHaveBeenCalledOnce());
    expect(sessions.saveSession).toHaveBeenCalledExactlyOnceWith({
      ...box,
      authentication: "password",
    });
  });

  it("explains network failures and reconnects on request", async () => {
    document.body.innerHTML = "";
    const reconnect = vi.fn();
    sshSolution(document, bridge(), translator)(
      { spec: { kind: "saved-session", id: "box" } },
      "ssh: connect to host 192.168.0.121 port 22: Connection timed out\r\n",
      reconnect,
    );
    const open = await dialog();
    expect(open.textContent).toContain("A conexão demorou demais");
    button(open, "Reconectar").click();
    await vi.waitFor(() => expect(reconnect).toHaveBeenCalledOnce());
  });
});
