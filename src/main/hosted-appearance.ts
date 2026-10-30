import type { TerminalRendererConfiguration } from "../shared/user-configuration";
import type { HostedAppearance } from "../shared/extension-view";

// Window identity never crosses the child bridge. Weak ownership retains no
// windows; epoch owners unsubscribe as soon as admission is revoked.
const windows = new WeakMap<
  object,
  {
    current?: HostedAppearance;
    listeners: Set<(appearance: HostedAppearance) => void>;
  }
>();
function state(owner: object) {
  let value = windows.get(owner);
  if (!value) {
    value = { listeners: new Set() };
    windows.set(owner, value);
  }
  return value;
}
export function publishHostedAppearance(
  owner: object,
  configuration: TerminalRendererConfiguration,
): void {
  const value = state(owner);
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
