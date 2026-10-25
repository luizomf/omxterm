import { englishMessages, type MessageKey } from "./locales/en-US";
import { brazilianPortugueseMessages } from "./locales/pt-BR";

export type { MessageKey } from "./locales/en-US";

// Translator and catalog structure adapted from ruscher/omxterm PR #622 at
// b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38 (MIT). OMXTerm defaults to en-US
// and never infers a language from the system; User Configuration selects it.
export const SUPPORTED_LANGUAGES = ["en-US", "pt-BR"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = "en-US";

// A message is a template or plural forms chosen by the `count` parameter
// through Intl.PluralRules. Templates interpolate `{name}` parameters.
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

export const MESSAGE_CATALOGS: Readonly<
  Record<SupportedLanguage, PartialMessageCatalog>
> = Object.freeze({
  "en-US": englishMessages,
  "pt-BR": brazilianPortugueseMessages,
});

export interface Translator {
  readonly language: SupportedLanguage;
  t(key: MessageKey, parameters?: MessageParameters): string;
}

export function isSupportedLanguage(
  value: unknown,
): value is SupportedLanguage {
  return (
    typeof value === "string" &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
  );
}

// A key missing from a catalog falls back to its English message.
export function createTranslator(
  language: SupportedLanguage,
  catalog: PartialMessageCatalog = MESSAGE_CATALOGS[language],
): Translator {
  const pluralRules = new Intl.PluralRules(language);
  return Object.freeze({
    language,
    t(key: MessageKey, parameters?: MessageParameters) {
      const message = catalog[key] ?? englishMessages[key];
      return interpolate(
        selectPlural(message, pluralRules, parameters?.count),
        parameters,
      );
    },
  });
}

const translators = new Map<SupportedLanguage, Translator>();

export function translatorFor(language: SupportedLanguage): Translator {
  let translator = translators.get(language);
  if (!translator) {
    translator = createTranslator(language);
    translators.set(language, translator);
  }
  return translator;
}

// Keys present in English but absent from a catalog.
export function missingTranslations(
  catalog: PartialMessageCatalog,
): readonly MessageKey[] {
  return (Object.keys(englishMessages) as MessageKey[]).filter(
    (key) => catalog[key] === undefined,
  );
}

// The `{name}` parameters a message uses, across all plural forms.
export function messageParameters(message: Message): readonly string[] {
  const texts =
    typeof message === "string" ? [message] : Object.values(message);
  return [
    ...new Set(
      texts.flatMap((text) =>
        [...(text ?? "").matchAll(/\{(\w+)\}/gu)].map((match) => match[1]!),
      ),
    ),
  ].sort();
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
