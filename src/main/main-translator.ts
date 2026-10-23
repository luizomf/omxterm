import {
  createTranslator,
  resolveLocale,
  type Translator,
} from "../shared/i18n";

// The language of menus and dialogs drawn by the main process: English until
// startup applies the system's preferred languages.
let active: Translator = createTranslator("en");

export const mainTranslator = (): Translator => active;

export function useSystemLanguages(languages: readonly string[]): Translator {
  active = createTranslator(resolveLocale(languages));
  return active;
}
