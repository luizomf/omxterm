import { describe, expect, it, vi } from "vitest";
import {
  terminalApplicationMenuTemplate,
  terminalClipboardContextMenuTemplate,
} from "../../src/main/application-menu";
import {
  terminalApplicationFailure,
  terminalApplicationFailureDisplay,
} from "../../src/main/terminal-application-failure";
import { terminalSessionFailureDialog } from "../../src/main/terminal-session-failure";
import {
  DEFAULT_USER_CONFIGURATION,
  UserConfigurationError,
  validateUserConfiguration,
} from "../../src/main/user-configuration";
import { createUserConfigurationReloader } from "../../src/main/user-configuration-reloader";
import {
  createTranslator,
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  MESSAGE_CATALOGS,
  messageParameters,
  missingTranslations,
  SUPPORTED_LANGUAGES,
  translatorFor,
  type Message,
  type MessageKey,
  type PluralMessage,
} from "../../src/shared/i18n";
import { englishMessages } from "../../src/shared/locales/en-US";
import { DEFAULT_TERMINAL_KEYBINDS } from "../../src/shared/terminal-keybinds";

const keys = Object.keys(englishMessages) as MessageKey[];
const forms = (message: Message) =>
  typeof message === "string" ? [message] : Object.values(message);

describe("message catalogs", () => {
  it.each(SUPPORTED_LANGUAGES)(
    "%s translates every key with the English placeholders",
    (language) => {
      const catalog = MESSAGE_CATALOGS[language];
      expect(missingTranslations(catalog)).toEqual([]);
      for (const key of keys) {
        const message = catalog[key]!;
        expect(messageParameters(message), key).toEqual(
          messageParameters(englishMessages[key]),
        );
        expect(typeof message, key).toBe(typeof englishMessages[key]);
        for (const text of forms(message))
          expect(text?.trim().length, key).toBeGreaterThan(0);
        const source: Message = englishMessages[key];
        if (typeof message !== "string" && typeof source !== "string") {
          expect(Object.keys(message).sort(), key).toEqual(
            Object.keys(source).sort(),
          );
          for (const form of Object.keys(source) as Array<keyof PluralMessage>)
            expect(messageParameters(message[form]!), `${key}.${form}`).toEqual(
              messageParameters(source[form]!),
            );
        }
      }
      expect(Object.keys(catalog).sort()).toEqual([...keys].sort());
    },
  );

  it("names each Settings language in itself in every catalog", () => {
    for (const catalog of Object.values(MESSAGE_CATALOGS)) {
      expect(catalog["settings.english"]).toBe("English (United States)");
      expect(catalog["settings.portuguese"]).toBe("Português (Brasil)");
    }
  });

  it("accepts only the exact supported language tags", () => {
    expect(DEFAULT_LANGUAGE).toBe("en-US");
    for (const language of SUPPORTED_LANGUAGES)
      expect(isSupportedLanguage(language)).toBe(true);
    for (const value of ["pt", "PT-BR", "pt_BR", "en", "", undefined, 1, {}])
      expect(isSupportedLanguage(value)).toBe(false);
  });
});

describe("translator", () => {
  it("interpolates named parameters literally and keeps unknown placeholders", () => {
    const { t } = translatorFor("pt-BR");
    expect(t("menu.quit", { name: "OMXTerm" })).toBe("Sair do OMXTerm");
    expect(t("menu.tab", { position: 3 })).toBe("Aba 3");
    expect(t("about.version", { version: "$& {name} $1" })).toBe(
      "Versão $& {name} $1",
    );
    expect(t("menu.quit")).toBe("Sair do {name}");
  });

  it("selects plural forms with the language's rules", () => {
    for (const [language, count, expected] of [
      ["en-US", 1, "previous x value."],
      ["en-US", 2, "previous x values."],
      ["pt-BR", 1, "o valor anterior de x."],
      ["pt-BR", 2, "os valores anteriores de x."],
    ] as const)
      expect(
        translatorFor(language).t("notice.restartDeferred", {
          count,
          settings: "x",
        }),
      ).toContain(expected);
    expect(
      translatorFor("en-US").t("notice.restartDeferred", { settings: "x" }),
    ).toContain("previous x values.");
  });

  it("falls back to English for a key missing from a catalog", () => {
    const { t } = createTranslator("pt-BR", { "common.ok": "Certo" });
    expect(t("common.ok")).toBe("Certo");
    expect(t("common.cancel")).toBe("Cancel");
    expect(missingTranslations({ "common.ok": "Certo" })).toHaveLength(
      keys.length - 1,
    );
  });

  it("reuses one frozen translator per language", () => {
    expect(translatorFor("pt-BR")).toBe(translatorFor("pt-BR"));
    expect(Object.isFrozen(translatorFor("pt-BR"))).toBe(true);
    expect(translatorFor("pt-BR").language).toBe("pt-BR");
  });
});

describe("configured language", () => {
  const validate = (document: Record<string, unknown>) =>
    validateUserConfiguration(
      { version: 1, ...document },
      "/isolated/config/omxterm/config.json",
      new Set(["SF Mono"]),
    );

  it("defaults to en-US and accepts every supported tag", () => {
    expect(DEFAULT_USER_CONFIGURATION.language).toBe("en-US");
    expect(validate({}).language).toBe("en-US");
    for (const language of SUPPORTED_LANGUAGES)
      expect(validate({ language }).language).toBe(language);
  });

  it.each(["pt", "PT-BR", "es-ES", "", null, 1, ["pt-BR"]])(
    "rejects language %j precisely",
    (language) => {
      expect(() => validate({ language })).toThrow(
        expect.objectContaining({
          location: "language",
          reason: "must be en-US, pt-BR",
        }),
      );
    },
  );
});

describe("translated main-process text", () => {
  const actions = new Proxy({}, { get: () => vi.fn() }) as Parameters<
    typeof terminalApplicationMenuTemplate
  >[1] &
    Parameters<typeof terminalClipboardContextMenuTemplate>[0];
  type Item = Electron.MenuItemConstructorOptions;
  const shape = (items: readonly Item[]): unknown[] =>
    items.map(({ label: _label, click: _click, submenu, ...item }) => ({
      ...item,
      submenu: Array.isArray(submenu) ? shape(submenu) : submenu,
    }));
  const labels = (items: readonly Item[]): string[] =>
    items.flatMap((item) => [
      ...(item.label ? [item.label] : []),
      ...(Array.isArray(item.submenu) ? labels(item.submenu) : []),
    ]);

  it("translates menu labels without changing roles, accelerators or order", () => {
    const english = terminalApplicationMenuTemplate(
      "OMXTerm",
      actions,
      DEFAULT_TERMINAL_KEYBINDS,
    );
    const portuguese = terminalApplicationMenuTemplate(
      "OMXTerm",
      actions,
      DEFAULT_TERMINAL_KEYBINDS,
      translatorFor("pt-BR").t,
    );
    expect(shape(portuguese)).toEqual(shape(english));
    expect(labels(portuguese)).toEqual(
      expect.arrayContaining(["Arquivo", "Nova Aba", "Aba 1", "Exibir"]),
    );
    expect(labels(portuguese)).not.toContain("New Tab");
    expect(
      labels(
        terminalClipboardContextMenuTemplate(
          actions,
          "selection",
          translatorFor("pt-BR").t,
        ),
      ),
    ).toEqual(["Copiar", "Colar", "Selecionar Tudo", "Exportar Seleção…"]);
  });

  it("translates failure dialogs without exposing raw causes", () => {
    const pt = translatorFor("pt-BR");
    expect(
      terminalSessionFailureDialog(
        { reason: "signal", launchKind: "explicit-command", signal: null },
        pt,
      ),
    ).toMatchObject({
      title: "O comando terminou inesperadamente",
      detail: "Sinal: desconhecido.",
      buttons: ["OK"],
    });
    const failure = terminalApplicationFailure(
      "startup",
      new Error("RAW /Users/private"),
    );
    expect(terminalApplicationFailureDisplay(failure, pt)).toEqual({
      title: "O OMXTerm não pôde iniciar",
      message: "Não foi possível criar a janela de terminal inicial.",
    });
  });

  it("frames reload notices in the active language around the English diagnostic", async () => {
    const initial = {
      ...DEFAULT_USER_CONFIGURATION,
      language: "pt-BR" as const,
    };
    const reloader = createUserConfigurationReloader({
      initial: { configuration: initial, userFileErrors: [] },
      load: async () => ({
        configuration: DEFAULT_USER_CONFIGURATION,
        fallback: {
          surface: "configuration" as const,
          error: new UserConfigurationError(
            "/isolated/config.json",
            "font.size",
            "must be from 8 through 72 $&",
          ),
        },
      }),
      apply: vi.fn(),
    });
    await reloader.reload();
    const [notice] = reloader.current().userFileErrors;
    expect(notice).toMatch(/^A recarga da configuração falhou\./u);
    expect(notice).toContain("must be from 8 through 72 $&");
    expect(notice).toContain("Recarregar Configuração");
    expect(reloader.current().configuration).toBe(initial);
  });
});
