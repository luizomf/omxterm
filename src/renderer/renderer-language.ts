import {
  DEFAULT_LANGUAGE,
  translatorFor,
  type SupportedLanguage,
  type Translator,
} from "../shared/i18n";
import type { TerminalSurfaceLabels } from "../terminal-surface/terminal-surface";

export type Translate = Translator["t"];

// One window's language, from the authoritative User Configuration sent by
// main. Bound labels apply now and again after each change, so switching
// language never recreates tabs, Surfaces or sessions.
export interface RendererLanguage {
  readonly t: Translate;
  set(language: SupportedLanguage | undefined): void;
  bind(apply: (t: Translate) => void): () => void;
}

export function createRendererLanguage(
  initial: SupportedLanguage = DEFAULT_LANGUAGE,
): RendererLanguage {
  let translator = translatorFor(initial);
  const bindings = new Set<(t: Translate) => void>();
  return {
    get t() {
      return translator.t;
    },
    set(language = DEFAULT_LANGUAGE) {
      if (language === translator.language) return;
      translator = translatorFor(language);
      for (const apply of [...bindings]) apply(translator.t);
    },
    bind(apply) {
      bindings.add(apply);
      apply(translator.t);
      return () => {
        bindings.delete(apply);
      };
    },
  };
}

// A window starts in the language of its initial configuration, if any.
export function windowLanguage(configuration?: {
  readonly language?: SupportedLanguage;
}): RendererLanguage {
  return createRendererLanguage(configuration?.language);
}

// The language used when a component is created without one (tests, fixtures).
export const englishLanguage: RendererLanguage = createRendererLanguage();

const labelsByLanguage = new Map<SupportedLanguage, TerminalSurfaceLabels>();

// One frozen labels object per language, so unchanged languages compare equal.
export function surfaceLabels(
  language: SupportedLanguage,
): TerminalSurfaceLabels {
  let labels = labelsByLanguage.get(language);
  if (!labels) {
    const { t } = translatorFor(language);
    labels = Object.freeze({
      surfaceRegion: t("terminal.surface"),
      searchRegion: t("search.region"),
      searchPlaceholder: t("search.placeholder"),
      searchClear: t("search.clear"),
      searchMatchAbove: t("search.matchAbove"),
      searchMatchBelow: t("search.matchBelow"),
      searchClose: t("search.close"),
    });
    labelsByLanguage.set(language, labels);
  }
  return labels;
}
