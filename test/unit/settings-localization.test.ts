// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createSettingsDialog } from "../../src/renderer/settings/settings-dialog";
import { createRendererLanguage } from "../../src/renderer/renderer-language";
import type {
  SettingsResult,
  SettingsSnapshot,
} from "../../src/shared/settings";
import { pages } from "../../src/renderer/settings/settings-pages";
import {
  base,
  button,
  deferred,
  installSettingsDom,
  open,
  saved,
} from "../fixtures/settings-dialog-dom";

beforeAll(installSettingsDom);
afterEach(() => document.body.replaceChildren());

it.each(["en-US", "pt-BR"] as const)(
  "relabels an active %s editor in place without adopting values or disturbing drafts",
  async (initial) => {
    const language = createRendererLanguage(initial);
    const pending = deferred<SettingsResult>();
    const view = await open({ change: vi.fn(() => pending.promise) }, language);
    const tabs = [
      ...document.querySelectorAll<HTMLButtonElement>("[role=tab]"),
    ];
    tabs.at(-1)!.click();
    const size = view.query<HTMLInputElement>("input[type=number]");
    size.value = "18";
    size.dispatchEvent(new Event("change"));
    const family = view.query<HTMLInputElement>(".settings-text input");
    family.value = "unfinished family";
    family.dispatchEvent(new Event("input"));
    const editor = view.query<HTMLTextAreaElement>("textarea");
    const draft = '\uFEFF{"version":1, "uncommitted": "$& <literal>"}\n';
    editor.value = draft;
    editor.dispatchEvent(new Event("input"));
    editor.focus();
    editor.setSelectionRange(4, 13, "backward");
    editor.scrollTop = 41;
    const panel = view.query<HTMLElement>(".settings-config-file");
    panel.scrollTop = 23;
    const next = initial === "en-US" ? "pt-BR" : "en-US";
    language.set(next);
    expect(view.query("textarea")).toBe(editor);
    expect(document.activeElement).toBe(editor);
    expect([
      editor.selectionStart,
      editor.selectionEnd,
      editor.selectionDirection,
      editor.scrollTop,
      panel.scrollTop,
    ]).toEqual([4, 13, "backward", 41, 23]);
    expect(editor.value).toBe(draft);
    expect(family.value).toBe("unfinished family");
    expect(size.value).toBe("18");
    expect(tabs.at(-1)!.getAttribute("aria-selected")).toBe("true");
    expect(tabs.at(-1)!.textContent).toBe(language.t("settings.page.file"));
    expect(view.status()).toBe(language.t("settings.saving"));
    expect(view.bridge.snapshot).toHaveBeenCalledOnce();
    expect(view.bridge.change).toHaveBeenCalledOnce();
    expect(view.bridge.saveText).not.toHaveBeenCalled();
    pending.resolve(
      saved({
        ...base,
        revision: "r2",
        values: { ...base.values, "font.size": 18 },
      }),
    );
    await view.settle();
    expect(view.status()).toBe(language.t("settings.saved"));
    expect(editor.value).toBe(draft);
    expect(family.value).toBe("unfinished family");
    language.set(initial);
    expect(view.status()).toBe(language.t("settings.saved"));
    expect(view.query(".settings-config-file [role=status]").textContent).toBe(
      language.t("settings.stale"),
    );
    expect(view.bridge.snapshot).toHaveBeenCalledOnce();
    expect(editor.value).toBe(draft);
    view.dialog.dispose();
  },
);

it.each(["en-US", "pt-BR"] as const)(
  "keeps autonyms, exact option values and the %s selection while relabeling",
  async (initial) => {
    const language = createRendererLanguage(initial);
    const view = await open(
      {
        snapshot: vi.fn(async () => ({
          ...base,
          values: { ...base.values, language: initial },
        })),
      },
      language,
    );
    const select = view.query<HTMLSelectElement>("select");
    const options = [...select.options];
    const assertOptions = () => {
      expect(select.options).toHaveLength(options.length);
      for (const [index, option] of [...select.options].entries())
        expect(option).toBe(options[index]);
      expect(
        [...select.options].map((option) => [option.value, option.textContent]),
      ).toEqual([
        ["en-US", "English (United States)"],
        ["pt-BR", "Português (Brasil)"],
      ]);
      expect(select.value).toBe(initial);
    };
    select.focus();
    assertOptions();
    language.set(initial === "en-US" ? "pt-BR" : "en-US");
    assertOptions();
    expect(document.activeElement).toBe(select);
    expect(view.bridge.snapshot).toHaveBeenCalledOnce();
    expect(view.bridge.change).not.toHaveBeenCalled();
    expect(view.bridge.saveText).not.toHaveBeenCalled();
    view.dialog.dispose();
  },
);

it("relabels raw pending, result, deferral and error identity with newer typing kept", async () => {
  const language = createRendererLanguage();
  const pending = deferred<SettingsResult>();
  const view = await open({ saveText: vi.fn(() => pending.promise) }, language);
  const editor = view.query<HTMLTextAreaElement>("textarea");
  editor.value = '{"version":1}';
  editor.dispatchEvent(new Event("input"));
  const save = button("Save");
  save.click();
  editor.value = "newer raw typing";
  editor.dispatchEvent(new Event("input"));
  language.set("pt-BR");
  expect(save.textContent).toBe("Salvar");
  expect(save.disabled).toBe(true);
  expect(view.query(".settings-config-file [role=status]").textContent).toBe(
    "Salvando…",
  );
  const diagnostic = "config.json is not valid JSON $& <literal>";
  pending.resolve(
    saved(
      { ...base, revision: "r2" },
      {
        applied: true,
        notices: [
          { kind: "deferred", fields: ["font.family", "font.lineHeight"] },
          diagnostic,
        ],
      },
      ["new-windows", "restart"],
    ),
  );
  await view.settle();
  const message = view.query(".settings-config-file [role=status]");
  expect(message.textContent).toContain("Salvo.");
  expect(message.textContent).toContain("O valor se aplica a novas janelas.");
  expect(message.textContent).toContain("font.family e font.lineHeight");
  expect(message.textContent).toContain(diagnostic);
  expect(message.textContent).toContain(
    "As edições mais recentes não foram salvas.",
  );
  expect(editor.value).toBe("newer raw typing");
  language.set("en-US");
  expect(message.textContent).toContain("font.family and font.lineHeight");
  expect(message.textContent).toContain(diagnostic);
  expect(view.bridge.saveText).toHaveBeenCalledOnce();
  expect(view.bridge.snapshot).toHaveBeenCalledOnce();
  view.dialog.dispose();
});

it("keeps file, reload and transport failures live without refetching on language changes", async () => {
  const language = createRendererLanguage();
  const reload = deferred<SettingsSnapshot>();
  const view = await open(
    {
      snapshot: vi
        .fn()
        .mockResolvedValueOnce({ ...base, problem: { kind: "json" } })
        .mockReturnValueOnce(reload.promise),
      change: vi.fn(async (): Promise<SettingsResult> => ({
        status: "failed",
        snapshot: base,
        message: { kind: "write" },
      })),
    },
    language,
  );
  language.set("pt-BR");
  expect(view.query(".settings-problem").textContent).toContain(
    "config.json não é JSON válido",
  );
  const editor = view.query<HTMLTextAreaElement>("textarea");
  editor.value = "draft";
  editor.dispatchEvent(new Event("input"));
  button("Recarregar Arquivo").click();
  language.set("en-US");
  expect(view.query(".settings-config-file [role=status]").textContent).toBe(
    "Reloading…",
  );
  reload.reject(new Error("private read error"));
  await view.settle();
  language.set("pt-BR");
  expect(view.query(".settings-config-file [role=status]").textContent).toBe(
    language.t("settings.reloadError"),
  );
  expect(editor.value).toBe("draft");
  expect(view.bridge.snapshot).toHaveBeenCalledTimes(2);
  const size = view.query<HTMLInputElement>("input[type=number]");
  size.value = "18";
  size.dispatchEvent(new Event("change"));
  await view.settle();
  expect(view.status()).toBe(language.t("settings.writeError"));
  language.set("en-US");
  expect(view.status()).toBe(language.t("settings.writeError"));
  expect(view.bridge.change).toHaveBeenCalledOnce();
  view.dialog.dispose();
});

it("relabels a retained initial load failure without retrying", async () => {
  const language = createRendererLanguage("pt-BR");
  const bridge = {
    snapshot: vi.fn(async (): Promise<SettingsSnapshot> => {
      throw new Error("private");
    }),
    change: vi.fn(),
    saveText: vi.fn(),
    onOpen: () => () => {},
  };
  const dialog = createSettingsDialog(document, bridge, {
    language,
    focusTerminal: vi.fn(),
    onActivityChange: vi.fn(),
  });
  await dialog.open();
  const status = document.querySelector(".settings-status")!;
  expect(status.textContent).toBe(
    "Não foi possível carregar as configurações.",
  );
  language.set("en-US");
  expect(status.textContent).toBe("Settings could not be loaded.");
  expect(bridge.snapshot).toHaveBeenCalledOnce();
  dialog.dispose();
  language.set("pt-BR");
  expect(status.textContent).toBe("Settings could not be loaded.");
});

it("relabels raw transport errors and saved-but-not-applied result identity without another request", async () => {
  const language = createRendererLanguage();
  const pending = deferred<SettingsResult>();
  const view = await open(
    {
      saveText: vi
        .fn()
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce(
          saved(base, {
            applied: false,
            notice: { kind: "reload", detail: "literal $& diagnostic" },
          }),
        ),
    },
    language,
  );
  const editor = view.query<HTMLTextAreaElement>("textarea");
  editor.value = "draft";
  editor.dispatchEvent(new Event("input"));
  button("Save").click();
  language.set("pt-BR");
  pending.reject(new Error("private transport"));
  await view.settle();
  const message = view.query(".settings-config-file [role=status]");
  expect(message.textContent).toBe("Não salvo: a solicitação falhou.");
  language.set("en-US");
  expect(message.textContent).toBe("Not saved: the request failed.");
  button("Save").click();
  await view.settle();
  expect(message.textContent).toContain(
    "Saved to config.json, but it could not be applied:",
  );
  language.set("pt-BR");
  expect(message.textContent).toContain(
    "Salvo em config.json, mas não foi possível aplicar:",
  );
  expect(message.textContent).toContain("literal $& diagnostic");
  expect(view.bridge.snapshot).toHaveBeenCalledOnce();
  expect(view.bridge.saveText).toHaveBeenCalledTimes(2);
  view.dialog.dispose();
});

it.each(["win32", "darwin", "linux"])(
  "catalogs every %s page/control/choice without translating stored values",
  async (platform) => {
    const language = createRendererLanguage("pt-BR");
    const view = await open(
      { snapshot: vi.fn(async () => ({ ...base, platform })) },
      language,
    );
    for (const page of pages(platform)) {
      expect(document.body.textContent).toContain(language.t(page.label));
      for (const control of page.controls) {
        expect(document.body.textContent).toContain(language.t(control.label));
        if (control.kind === "choice")
          for (const [value, label] of control.options) {
            const option = [...document.querySelectorAll("option")].find(
              (option) =>
                option.value === value &&
                option.textContent === language.t(label),
            );
            expect(option).toBeDefined();
          }
      }
    }
    const size = view.query<HTMLInputElement>("input[type=number]");
    vi.spyOn(size, "reportValidity").mockImplementation(() => {
      expect(size.validationMessage).toBe("Fora do intervalo");
      return false;
    });
    size.value = "4";
    size.dispatchEvent(new Event("change"));
    expect(view.bridge.change).not.toHaveBeenCalled();
    view.dialog.dispose();
  },
);
