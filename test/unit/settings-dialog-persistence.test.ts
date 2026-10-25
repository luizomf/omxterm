// @vitest-environment jsdom
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createSettingsService } from "../../src/main/settings-service";
import { createSettingsDialog } from "../../src/renderer/settings/settings-dialog";
import { loadUserConfiguration } from "../../src/main/user-configuration";
import { createUserConfigurationReloader } from "../../src/main/user-configuration-reloader";
import type { SettingsBridge, SettingsResult } from "../../src/shared/settings";
import { deferred, installSettingsDom } from "../fixtures/settings-dialog-dom";

it("keeps newer typing and external bytes after a BOM raw save finishes applying", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "omxterm-settings-bom-draft-"),
  );
  roots.push(root);
  const loadOptions = {
    environment: { XDG_CONFIG_HOME: root },
    homeDirectory: root,
    getInstalledFontFamilyMetrics: async () => undefined,
  };
  const initial = await loadUserConfiguration(loadOptions);
  const reloader = createUserConfigurationReloader({
    initial: { configuration: initial.configuration, userFileErrors: [] },
    load: () => loadUserConfiguration(loadOptions),
    apply: vi.fn(),
  });
  const entered = deferred<void>();
  const resume = deferred<void>();
  const service = createSettingsService({
    loadOptions,
    reload: async () => {
      const result = await reloader.reload();
      entered.resolve();
      await resume.promise;
      return result;
    },
  });
  const saves: Promise<SettingsResult>[] = [];
  const save = vi.fn((...args: Parameters<SettingsBridge["saveText"]>) => {
    const pending = service.saveText(...args);
    saves.push(pending);
    return pending;
  });
  const dialog = createSettingsDialog(
    document,
    {
      snapshot: service.snapshot,
      change: service.change,
      saveText: save,
      changeKeybind: vi.fn(),
      captureShortcut: vi.fn(() => () => {}),
      onOpen: () => () => {},
    },
    { focusTerminal: vi.fn(), onActivityChange: vi.fn() },
  );
  try {
    await dialog.open();
    const editor = document.querySelector<HTMLTextAreaElement>("textarea")!;
    editor.value = '\uFEFF{"version":1,"logLevel":"debug"}';
    editor.dispatchEvent(new Event("input"));
    const button = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Save",
    )!;
    button.click();
    await entered.promise;
    const newer = '{"version":1,"logLevel":"debug","font":{"size":21}}';
    editor.value = newer;
    editor.dispatchEvent(new Event("input"));
    const external = '{"version":1,"logLevel":"error"}';
    const file = path.join(root, "omxterm", "config.json");
    await writeFile(file, external);
    resume.resolve();
    const result = await saves[0]!;
    expect(result).toMatchObject({
      status: "saved",
      application: { applied: true },
    });
    expect(editor.value).toBe(newer);
    expect(
      document.querySelector(".settings-config-file [role=status]")!
        .textContent,
    ).toBe("Saved. Newer edits are not saved.");
    expect(reloader.current().configuration.logLevel).toBe("debug");
    expect(await readFile(file, "utf8")).toBe(external);
    button.click();
    expect(save).toHaveBeenLastCalledWith(newer, result.snapshot.revision);
    expect(await saves[1]!).toMatchObject({
      status: "conflict",
    });
    expect(editor.value).toBe(newer);
    expect(await readFile(file, "utf8")).toBe(external);
  } finally {
    resume.resolve();
    dialog.dispose();
  }
});

it("orders shared-file reads across two dialog lifetimes without adopting into the other window's draft", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-settings-windows-"));
  roots.push(root);
  const entered = deferred<void>();
  const resume = deferred<void>();
  let reloads = 0;
  const service = createSettingsService({
    loadOptions: {
      environment: { XDG_CONFIG_HOME: root },
      homeDirectory: root,
      getInstalledFontFamilyMetrics: async () => undefined,
    },
    reload: async () => {
      if (++reloads === 1) {
        entered.resolve();
        await resume.promise;
      }
      return { applied: true, notices: [] };
    },
  });
  const bridge = {
    ...service,
    captureShortcut: vi.fn(() => () => {}),
    onOpen: () => () => {},
  };
  const otherDocument =
    document.implementation.createHTMLDocument("second window");
  const first = createSettingsDialog(document, bridge, {
    focusTerminal: vi.fn(),
    onActivityChange: vi.fn(),
  });
  const second = createSettingsDialog(otherDocument, bridge, {
    focusTerminal: vi.fn(),
    onActivityChange: vi.fn(),
  });
  const size = (doc: Document) =>
    [...doc.querySelectorAll("label")]
      .find((row) => row.textContent?.startsWith("Font size"))!
      .querySelector("input")!;
  try {
    await first.open();
    await second.open();
    const otherDraft =
      otherDocument.querySelector<HTMLTextAreaElement>("textarea")!;
    otherDraft.value = "second window draft";
    otherDraft.dispatchEvent(new Event("input"));
    for (const value of ["18", "19"]) {
      size(document).value = value;
      size(document).dispatchEvent(new Event("change"));
    }
    await entered.promise;
    size(otherDocument).value = "20";
    size(otherDocument).dispatchEvent(new Event("change"));
    document.querySelector<HTMLButtonElement>(".settings-close")!.click();
    const reopening = first.open();
    resume.resolve();
    await reopening;
    expect(size(document).value).toBe("20");
    expect(size(otherDocument).value).toBe("20");
    expect(otherDraft.value).toBe("second window draft");
    expect(
      JSON.parse(
        await readFile(path.join(root, "omxterm", "config.json"), "utf8"),
      ),
    ).toEqual({ version: 1, font: { size: 20 } });
  } finally {
    resume.resolve();
    first.dispose();
    second.dispose();
  }
});

beforeAll(installSettingsDom);
const roots: string[] = [];
afterEach(async () => {
  document.body.replaceChildren();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

it.each([false, true])(
  "reopens after all requested graphical writes (first application fails: %s)",
  async (applicationFails) => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-settings-reopen-"));
    roots.push(root);
    const entered = deferred<void>();
    const resume = deferred<void>();
    let reloads = 0;
    const service = createSettingsService({
      loadOptions: {
        environment: { XDG_CONFIG_HOME: root },
        homeDirectory: root,
        getInstalledFontFamilyMetrics: async () => undefined,
      },
      reload: async () => {
        if (++reloads === 1) {
          entered.resolve();
          await resume.promise;
          if (applicationFails) throw new Error("application failure");
        }
        return { applied: true, notices: [] };
      },
    });
    const second = deferred<SettingsResult>();
    const bridge: SettingsBridge = {
      snapshot: () => service.snapshot(),
      change: async (change) => {
        const result = await service.change(change);
        if (change.value === 19) second.resolve(result);
        return result;
      },
      saveText: service.saveText,
      changeKeybind: vi.fn(),
      captureShortcut: vi.fn(() => () => {}),
      onOpen: () => () => {},
    };
    const dialog = createSettingsDialog(document, bridge, {
      focusTerminal: vi.fn(),
      onActivityChange: vi.fn(),
    });
    const size = () =>
      [...document.querySelectorAll("label")]
        .find((row) => row.textContent?.startsWith("Font size"))!
        .querySelector("input")!;
    try {
      await dialog.open();
      size().value = "18";
      size().dispatchEvent(new Event("change"));
      size().value = "19";
      size().dispatchEvent(new Event("change"));
      await entered.promise;
      document.querySelector<HTMLButtonElement>(".settings-close")!.click();
      const reopening = dialog.open();
      resume.resolve();
      await reopening;
      const saved = await second.promise;
      expect(
        JSON.parse(
          await readFile(path.join(root, "omxterm", "config.json"), "utf8"),
        ),
      ).toEqual({ version: 1, font: { size: 19 } });
      expect(size().value).toBe("19");
      expect(document.querySelector(".settings-status")!.textContent).toBe("");
      const editor = document.querySelector<HTMLTextAreaElement>("textarea")!;
      expect(editor.value).toBe(saved.snapshot.text);
      // The clean reopened raw editor must own the current file's revision too.
      editor.value = '{"version":1,"font":{"size":20}}';
      editor.dispatchEvent(new Event("input"));
      const rawSaved = deferred<SettingsResult>();
      bridge.saveText = async (...args) => {
        const result = await service.saveText(...args);
        rawSaved.resolve(result);
        return result;
      };
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent === "Save")!
        .click();
      expect(await rawSaved.promise).toMatchObject({
        status: "saved",
        snapshot: { values: { "font.size": 20 } },
      });
    } finally {
      resume.resolve();
      dialog.dispose();
    }
  },
);
