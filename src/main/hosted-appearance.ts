import type { TerminalRendererConfiguration } from "../shared/user-configuration";
import type { HostedAppearance } from "../shared/extension-view";
import { DEFAULT_LANGUAGE, type SupportedLanguage } from "../shared/i18n";

// Window identity never crosses the child bridge. Weak ownership retains no
// windows; epoch owners unsubscribe as soon as admission is revoked.
const windows = new WeakMap<
  object,
  {
    current?: HostedAppearance;
    language?: SupportedLanguage;
    languageListeners: Set<(language: SupportedLanguage) => void>;
    listeners: Set<(appearance: HostedAppearance) => void>;
  }
>();
function state(owner: object) {
  let value = windows.get(owner);
  if (!value) {
    value = { listeners: new Set(), languageListeners: new Set() };
    windows.set(owner, value);
  }
  return value;
}
export function publishHostedAppearance(
  owner: object,
  configuration: TerminalRendererConfiguration,
): void {
  const value = state(owner);
  const language = configuration.language ?? DEFAULT_LANGUAGE;
  if (language !== value.language) {
    value.language = language;
    for (const listener of value.languageListeners) listener(language);
  }
  const { background, foreground } = configuration.terminalTheme.colors;
  const opacity = 1 - configuration.transparency;
  if (
    value.current?.background === background &&
    value.current.foreground === foreground &&
    value.current.opacity === opacity
  )
    return;
  value.current = Object.freeze({ background, foreground, opacity });
  for (const listener of value.listeners) listener(value.current);
}
export function subscribeHostedLanguage(
  owner: object,
  listener: (language: SupportedLanguage) => void,
): () => void {
  const value = state(owner);
  value.languageListeners.add(listener);
  if (value.language) listener(value.language);
  return () => {
    value.languageListeners.delete(listener);
  };
}

export function subscribeHostedAppearance(
  owner: object,
  listener: (appearance: HostedAppearance) => void,
): () => void {
  const value = state(owner);
  value.listeners.add(listener);
  if (value.current) listener(value.current);
  return () => {
    value.listeners.delete(listener);
  };
}
