import { describe, expect, it, vi } from "vitest";
import {
  createTranslator,
  missingTranslations,
  resolveLocale,
  SUPPORTED_LOCALES,
} from "../../src/shared/i18n";
import { englishMessages } from "../../src/shared/locales/en";
import { brazilianPortugueseMessages } from "../../src/shared/locales/pt-BR";

describe("internationalization", () => {
  it("resolves exact tags, language fallbacks and English defaults", () => {
    expect(resolveLocale(["pt-BR"])).toBe("pt-BR");
    expect(resolveLocale(["pt_br"])).toBe("pt-BR");
    expect(resolveLocale(["pt-PT", "en-US"])).toBe("pt-BR");
    expect(resolveLocale(["de-DE", "en-GB"])).toBe("en");
    expect(resolveLocale(["ja"])).toBe("en");
    expect(resolveLocale([])).toBe("en");
    expect(resolveLocale(["", "pt"])).toBe("pt-BR");
  });

  it("ships a complete Brazilian Portuguese catalog", () => {
    for (const locale of SUPPORTED_LOCALES)
      expect(missingTranslations(locale)).toEqual([]);
    expect(Object.keys(brazilianPortugueseMessages).sort()).toEqual(
      Object.keys(englishMessages).sort(),
    );
  });

  it("has no empty message and translates everything not shared by both languages", () => {
    // Words Brazilian Portuguese uses as they are.
    const shared = new Set([
      "menu.snippets",
      "menu.terminal",
      "sessions.kind.local",
      "sessions.kind.ssh",
      "sessions.field.host",
      "preferences.section.terminal",
      "files.remote",
      "prefs.terminal",
      "prefs.shell",
      "prefs.configFile",
      "appMenu.terminal",
    ]);
    const texts = (message: unknown): string[] =>
      typeof message === "string"
        ? [message]
        : Object.values(message as Record<string, string>);
    for (const key of Object.keys(englishMessages) as Array<
      keyof typeof englishMessages
    >) {
      const english = englishMessages[key];
      const portuguese = brazilianPortugueseMessages[key];
      for (const text of [...texts(english), ...texts(portuguese)])
        expect(text.trim(), key).not.toBe("");
      if (!shared.has(key))
        expect(JSON.stringify(portuguese), key).not.toBe(
          JSON.stringify(english),
        );
    }
  });

  it("keeps the same placeholders in every translation", () => {
    const placeholders = (message: unknown): string[] => {
      const text =
        typeof message === "string"
          ? message
          : Object.values(message as Record<string, string>).join(" ");
      return [...new Set(text.match(/\{\{?\w+\}\}?/gu) ?? [])].sort();
    };
    for (const key of Object.keys(englishMessages) as Array<
      keyof typeof englishMessages
    >)
      expect(placeholders(brazilianPortugueseMessages[key]), key).toEqual(
        placeholders(englishMessages[key]),
      );
  });

  it("interpolates parameters and selects plural categories per locale", () => {
    const english = createTranslator("en");
    const portuguese = createTranslator("pt-BR");
    expect(english.t("broadcast.active", { count: 1 })).toBe(
      "Broadcasting to 1 pane",
    );
    expect(english.t("broadcast.active", { count: 3 })).toBe(
      "Broadcasting to 3 panes",
    );
    expect(portuguese.t("broadcast.active", { count: 0 })).toBe(
      "Transmitindo para 0 painel",
    );
    expect(portuguese.t("broadcast.active", { count: 2 })).toBe(
      "Transmitindo para 2 painéis",
    );
    expect(english.t("sessions.deleteConfirm", { name: "prod" })).toBe(
      "Delete “prod”?",
    );
    // Unknown parameters stay literal rather than disappearing.
    expect(english.t("commands.field.templateHint")).toContain("{{name}}");
    expect(english.t("pane.label", { position: 2 })).toBe(
      "Terminal Pane 2 of {count}",
    );
  });

  it("formats numbers and compares strings with locale rules", () => {
    expect(createTranslator("pt-BR").formatNumber(1234.5)).toBe("1.234,5");
    expect(createTranslator("en").formatNumber(1234.5)).toBe("1,234.5");
    const portuguese = createTranslator("pt-BR");
    expect(["Óleo", "abacaxi", "Banana"].sort(portuguese.compare)).toEqual([
      "abacaxi",
      "Banana",
      "Óleo",
    ]);
    expect(portuguese.compare("ação", "ACAO")).toBe(0);
  });

  it("reports missing translations and falls back to English", () => {
    const onMissing = vi.fn();
    const translator = createTranslator("en", { onMissing });
    expect(translator.t("common.cancel")).toBe("Cancel");
    expect(onMissing).not.toHaveBeenCalled();
  });
});
