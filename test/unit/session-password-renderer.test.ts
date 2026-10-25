// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTranslator } from "../../src/shared/i18n";
import type {
  SavedSessionsDocument,
  SshSessionDefinition,
} from "../../src/shared/saved-sessions";
import type { SessionPasswordState } from "../../src/shared/session-ipc";
import { editSession } from "../../src/renderer/sessions/session-editor";
import { passwordOffer } from "../../src/renderer/sessions/session-password-offer";
import {
  DEFAULT_ENDED_BANNER_STRINGS,
  showEndedBanner,
  type TerminalPane,
} from "../../src/renderer/terminal-tab-model";
import { createSessionsBridge } from "../../src/preload/sessions-bridge";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

const translator = createTranslator("en");
const empty: SavedSessionsDocument = { folders: [], sessions: [] };

async function openEditor(
  state: SessionPasswordState,
  existing?: SshSessionDefinition,
) {
  document.body.innerHTML = "";
  const save = vi.fn(
    async (candidate: unknown) =>
      ({ id: "new-id", ...(candidate as object) }) as never,
  );
  const setPassword = vi.fn(async () => undefined);
  const result = editSession(
    {
      document,
      translator,
      sessions: empty,
      chooseFile: async () => null,
      save,
      passwordState: async () => state,
      setPassword,
    },
    existing,
  );
  const dialog = await vi.waitFor(() => {
    const element = document.querySelector("dialog");
    if (!element) throw new Error("not open yet");
    return element;
  });
  const fieldNamed = (label: string) =>
    [...dialog.querySelectorAll<HTMLElement>(".omx-field")].find(
      (field) => field.querySelector("label")?.textContent === label,
    )!;
  const control = (label: string) =>
    fieldNamed(label).querySelector<HTMLInputElement & HTMLSelectElement>(
      "input, select",
    )!;
  const prompt = [
    ...dialog.querySelectorAll<HTMLLabelElement>(".omx-checkbox"),
  ].find((label) => label.textContent === "Password (typed when prompted)")!;
  const choose = (value: string) => {
    const select = control("Authentication");
    select.value = value;
    select.dispatchEvent(new Event("change"));
  };
  return {
    result,
    save,
    setPassword,
    dialog,
    fieldNamed,
    control,
    prompt,
    choose,
    reveal: () =>
      dialog.querySelector<HTMLButtonElement>(".omx-password-reveal")!,
    submit: () =>
      dialog.querySelector<HTMLButtonElement>(".omx-button-primary")!.click(),
  };
}

describe("Password authentication in the session editor", () => {
  it("shows a hidden password with a show/hide toggle only for Password", async () => {
    const view = await openEditor({ storage: "available", saved: false });
    expect(view.fieldNamed("Password").hidden).toBe(true);
    view.choose("password");
    expect(view.fieldNamed("Password").hidden).toBe(false);
    expect(view.prompt.hidden).toBe(false);
    const input = view.control("Password");
    expect(input.type).toBe("password");
    expect(view.reveal().getAttribute("aria-label")).toBe("Show password");
    view.reveal().click();
    expect(input.type).toBe("text");
    expect(view.reveal().getAttribute("aria-pressed")).toBe("true");
    expect(view.reveal().getAttribute("aria-label")).toBe("Hide password");
    view.reveal().click();
    expect(input.type).toBe("password");
  });

  it("requires a password or the prompted choice, then stores it after saving", async () => {
    const view = await openEditor({ storage: "available", saved: false });
    view.control("Name").value = "DB";
    view.control("Host").value = "db.internal";
    view.choose("password");
    view.submit();
    await vi.waitFor(() =>
      expect(
        view.fieldNamed("Password").querySelector(".omx-field-error")!
          .textContent,
      ).toBe("Type the password, or choose Password (typed when prompted)."),
    );
    expect(view.save).not.toHaveBeenCalled();
    view.control("Password").value = "s3cret pass";
    view.submit();
    await expect(view.result).resolves.toBe(true);
    expect(view.save).toHaveBeenCalledOnce();
    expect(JSON.stringify(view.save.mock.calls)).not.toContain("s3cret");
    expect(view.setPassword).toHaveBeenCalledExactlyOnceWith(
      "new-id",
      "s3cret pass",
    );
  });

  it("types the password when prompted without storing it", async () => {
    const view = await openEditor({ storage: "available", saved: false });
    view.control("Name").value = "DB";
    view.control("Host").value = "db.internal";
    view.choose("password");
    view.control("Password").value = "typed";
    view.prompt.querySelector("input")!.click();
    expect(view.control("Password").disabled).toBe(true);
    expect(view.control("Password").value).toBe("");
    view.submit();
    await expect(view.result).resolves.toBe(true);
    expect(view.setPassword).not.toHaveBeenCalled();
  });

  it("keeps or removes a saved password without ever showing it", async () => {
    const existing: SshSessionDefinition = {
      id: "db",
      kind: "ssh",
      name: "DB",
      host: "db.internal",
      authentication: "password",
    };
    const keep = await openEditor(
      { storage: "available", saved: true },
      existing,
    );
    expect(keep.control("Password").value).toBe("");
    expect(keep.control("Password").placeholder).toBe(
      "Saved. Type to replace it",
    );
    expect(keep.prompt.querySelector("input")!.checked).toBe(false);
    keep.submit();
    await expect(keep.result).resolves.toBe(true);
    expect(keep.setPassword).not.toHaveBeenCalled();

    const switched = await openEditor(
      { storage: "available", saved: true },
      existing,
    );
    switched.choose("agent");
    switched.submit();
    await expect(switched.result).resolves.toBe(true);
    expect(switched.setPassword).toHaveBeenCalledExactlyOnceWith("db", null);
  });

  it("explains when no secure keyring can store the password", async () => {
    const view = await openEditor({ storage: "unavailable", saved: false });
    view.choose("password");
    const checkbox = view.prompt.querySelector("input")!;
    expect(checkbox.checked).toBe(true);
    expect(checkbox.disabled).toBe(true);
    expect(view.control("Password").disabled).toBe(true);
    expect(view.fieldNamed("Password").textContent).toContain(
      "No secure system keyring is available",
    );
  });
});

describe("Password offer after a failed sign-in", () => {
  const session: SshSessionDefinition = {
    id: "db",
    kind: "ssh",
    name: "DB",
    host: "db.internal",
    authentication: "key",
    identityFile: "~/.ssh/id_ed25519",
  };
  const bridge = (sessions = [session]) => ({
    list: vi.fn(async () => ({ folders: [], sessions })),
    saveSession: vi.fn(async (value: unknown) => value as never),
  });
  const saved = { spec: { kind: "saved-session" as const, id: "db" } };

  it("offers switching an agent or key session to a prompted password", async () => {
    const sessions = bridge();
    const offer = await passwordOffer(sessions, translator)(
      saved,
      "deploy@db.internal: Permission denied (publickey).\r\n",
    );
    expect(offer?.message).toBe(
      "Authentication failed. Switch this session to Password (typed when prompted)?",
    );
    expect(offer?.label).toBe("Use password and reconnect");
    await offer!.apply();
    expect(sessions.saveSession).toHaveBeenCalledExactlyOnceWith({
      ...session,
      authentication: "password",
    });
  });

  it("offers nothing for other failures, password sessions or Quick Connect", async () => {
    const offer = passwordOffer(bridge(), translator);
    expect(
      await offer(saved, "ssh: connect to host db port 22: Connection refused"),
    ).toBeUndefined();
    expect(
      await offer(
        { spec: { kind: "quick-ssh", target: "db" } },
        "Permission denied (publickey).",
      ),
    ).toBeUndefined();
    expect(
      await passwordOffer(
        bridge([{ ...session, authentication: "password" }]),
        translator,
      )(saved, "Permission denied (password)."),
    ).toBeUndefined();
  });

  it("adds the offer to the ended banner and reconnects once it is applied", async () => {
    document.body.innerHTML = "";
    const container = document.createElement("main");
    document.body.append(container);
    const reconnect = vi.fn();
    const addOffer = showEndedBanner(
      { container } as unknown as TerminalPane,
      255,
      DEFAULT_ENDED_BANNER_STRINGS,
      { reconnect, close: vi.fn() },
    );
    const apply = vi.fn(async () => undefined);
    addOffer({ message: "Switch?", label: "Use password", apply });
    const buttons = [...container.querySelectorAll("button")].map(
      (button) => button.textContent,
    );
    expect(buttons).toEqual(["Use password", "Reconnect", "Close"]);
    container.querySelector<HTMLButtonElement>("button")!.click();
    await vi.waitFor(() => expect(reconnect).toHaveBeenCalledOnce());
    expect(apply).toHaveBeenCalledOnce();
  });
});

describe("Sessions bridge password requests", () => {
  it("never sends a malformed password and checks main's answer", async () => {
    const invoke = vi.fn(async (channel: string) =>
      channel === "sessions:password-state"
        ? { storage: "available", saved: true }
        : undefined,
    );
    const bridge = createSessionsBridge({
      invoke,
      on: vi.fn(),
      removeListener: vi.fn(),
    } as never);
    await expect(bridge.passwordState("db")).resolves.toEqual({
      storage: "available",
      saved: true,
    });
    expect(invoke).toHaveBeenLastCalledWith("sessions:password-state", "db");
    await bridge.passwordState();
    expect(invoke).toHaveBeenLastCalledWith("sessions:password-state", null);
    await expect(bridge.setPassword("db", "line\nbreak")).rejects.toThrow(
      TypeError,
    );
    await bridge.setPassword("db", null);
    expect(invoke).toHaveBeenLastCalledWith("sessions:set-password", {
      id: "db",
      password: null,
    });
    invoke.mockResolvedValueOnce({ storage: "keyring", saved: true } as never);
    await expect(bridge.passwordState("db")).rejects.toThrow(TypeError);
  });
});
