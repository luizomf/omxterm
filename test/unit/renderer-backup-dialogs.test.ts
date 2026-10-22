// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTranslator } from "../../src/shared/i18n";
import type { BackupRequest } from "../../src/shared/backup-ipc";
import type { BackupBridge } from "../../src/shared/terminal-bridge";
import { installBackupDialogs } from "../../src/renderer/backup/backup-dialogs";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

function setup(overrides: Partial<BackupBridge> = {}) {
  document.body.innerHTML = "";
  let request: ((kind: BackupRequest) => void) | undefined;
  const bridge: BackupBridge = {
    create: vi.fn(async () => true),
    choose: vi.fn(async () => true),
    restore: vi.fn(async () => ({ restored: 4 })),
    onRequest: (listener) => {
      request = listener;
      return () => {
        request = undefined;
      };
    },
    ...overrides,
  };
  const notify = vi.fn();
  const remove = installBackupDialogs(document, {
    bridge,
    translator: createTranslator("en"),
    notify,
  });
  return {
    bridge,
    notify,
    remove,
    request: (kind: BackupRequest) => request!(kind),
  };
}

const dialog = () =>
  vi.waitFor(() => {
    const element = document.querySelector<HTMLDialogElement>("dialog[open]");
    if (!element) throw new Error("no dialog");
    return element;
  });
const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
const primary = (element: HTMLElement) =>
  element
    .querySelector<HTMLButtonElement>(".omx-modal-actions button:last-child")!
    .click();

describe("settings backup dialogs", () => {
  it("asks for a confirmed passphrase before main saves the backup", async () => {
    const { bridge, notify, request } = setup();
    request("create");
    const element = await dialog();
    const [passphrase, repeat] = element.querySelectorAll<HTMLInputElement>(
      "input[type=password]",
    );
    type(passphrase!, "short");
    primary(element);
    await vi.waitFor(() =>
      expect(element.querySelector(".omx-field-error")?.textContent).toBe(
        "Use at least 8 characters.",
      ),
    );
    type(passphrase!, "long enough phrase");
    type(repeat!, "different phrase");
    primary(element);
    await vi.waitFor(() =>
      expect(element.textContent).toContain("The passphrases do not match."),
    );
    expect(bridge.create).not.toHaveBeenCalled();
    type(repeat!, "long enough phrase");
    primary(element);
    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith("Backup saved."),
    );
    expect(bridge.create).toHaveBeenCalledWith("long enough phrase");
  });

  it("restores only after a file is chosen and shows a wrong passphrase in the form", async () => {
    const cancelled = setup({ choose: vi.fn(async () => false) });
    cancelled.request("restore");
    await vi.waitFor(() => expect(cancelled.bridge.choose).toHaveBeenCalled());
    expect(document.querySelector("dialog")).toBeNull();

    const restore = vi
      .fn<BackupBridge["restore"]>()
      .mockRejectedValueOnce(
        new Error(
          "Error invoking remote method 'backup:restore': Error: The passphrase is wrong or the backup is damaged",
        ),
      )
      .mockResolvedValueOnce({ restored: 1 });
    const { notify, request } = setup({ restore });
    request("restore");
    const element = await dialog();
    type(element.querySelector("input[type=password]")!, "some passphrase");
    primary(element);
    await vi.waitFor(() =>
      expect(element.querySelector(".omx-field-error")?.textContent).toBe(
        "The passphrase is wrong or the backup is damaged",
      ),
    );
    primary(element);
    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith("Settings restored (1 file)."),
    );
  });
});
