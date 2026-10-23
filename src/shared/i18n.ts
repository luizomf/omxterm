import { englishMessages, type MessageKey } from "./locales/en";
import { brazilianPortugueseMessages } from "./locales/pt-BR";

export type { MessageKey } from "./locales/en";

export const SUPPORTED_LOCALES = ["en", "pt-BR"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en";

// A message is either a plain template or a plural form selected by the
// `count` parameter through Intl.PluralRules. Templates interpolate `{name}`.
export type PluralMessage = {
  readonly one?: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
};
export type Message = string | PluralMessage;
export type MessageCatalog = Readonly<Record<MessageKey, Message>>;
export type PartialMessageCatalog = Readonly<
  Partial<Record<MessageKey, Message>>
>;
export type MessageParameters = Readonly<Record<string, string | number>>;

const CATALOGS: Readonly<Record<SupportedLocale, PartialMessageCatalog>> =
  Object.freeze({
    en: englishMessages,
    "pt-BR": brazilianPortugueseMessages,
  });

// Resolve the first supported locale from an ordered preference list, matching
// an exact tag first and then the language subtag ("pt-PT" falls back to the
// only Portuguese catalog). Unknown preferences fall back to English.
export function resolveLocale(preferences: readonly string[]): SupportedLocale {
  for (const preference of preferences) {
    if (typeof preference !== "string" || preference.length === 0) continue;
    const exact = SUPPORTED_LOCALES.find(
      (locale) => locale.toLowerCase() === preference.toLowerCase(),
    );
    if (exact) return exact;
    const language = preference.split(/[-_]/u)[0]!.toLowerCase();
    const sameLanguage = SUPPORTED_LOCALES.find(
      (locale) => locale.split("-")[0]!.toLowerCase() === language,
    );
    if (sameLanguage) return sameLanguage;
  }
  return DEFAULT_LOCALE;
}

export interface Translator {
  readonly locale: SupportedLocale;
  t(key: MessageKey, parameters?: MessageParameters): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
  formatDate(
    value: Date | number,
    options?: Intl.DateTimeFormatOptions,
  ): string;
  compare(first: string, second: string): number;
}

export interface TranslatorOptions {
  readonly onMissing?: (key: MessageKey, locale: SupportedLocale) => void;
}

export function createTranslator(
  locale: SupportedLocale,
  options: TranslatorOptions = {},
): Translator {
  const catalog = CATALOGS[locale];
  const pluralRules = new Intl.PluralRules(locale);
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  const numbers = new Map<string, Intl.NumberFormat>();
  return Object.freeze({
    locale,
    t(key: MessageKey, parameters?: MessageParameters) {
      let message = catalog[key];
      if (message === undefined) {
        options.onMissing?.(key, locale);
        message = englishMessages[key];
      }
      return interpolate(
        selectPlural(message, pluralRules, parameters?.count),
        parameters,
      );
    },
    formatNumber(value: number, formatOptions?: Intl.NumberFormatOptions) {
      const cacheKey = JSON.stringify(formatOptions ?? {});
      let format = numbers.get(cacheKey);
      if (!format) {
        format = new Intl.NumberFormat(locale, formatOptions);
        numbers.set(cacheKey, format);
      }
      return format.format(value);
    },
    formatDate(
      value: Date | number,
      formatOptions?: Intl.DateTimeFormatOptions,
    ) {
      return new Intl.DateTimeFormat(locale, formatOptions).format(value);
    },
    compare: (first: string, second: string) => collator.compare(first, second),
  });
}

// Keys present in English but absent from a locale's catalog: the build-time
// missing-translation diagnostic used by tests and `--debug` startup.
export function missingTranslations(
  locale: SupportedLocale,
): readonly MessageKey[] {
  const catalog = CATALOGS[locale];
  return (Object.keys(englishMessages) as MessageKey[]).filter(
    (key) => catalog[key] === undefined,
  );
}

function selectPlural(
  message: Message,
  rules: Intl.PluralRules,
  count: string | number | undefined,
): string {
  if (typeof message === "string") return message;
  if (typeof count !== "number") return message.other;
  const category = rules.select(count) as keyof PluralMessage;
  return message[category] ?? message.other;
}

function interpolate(
  template: string,
  parameters: MessageParameters | undefined,
): string {
  if (!parameters) return template;
  return template.replace(/\{(\w+)\}/gu, (match, name: string) =>
    Object.hasOwn(parameters, name) ? String(parameters[name]) : match,
  );
}
