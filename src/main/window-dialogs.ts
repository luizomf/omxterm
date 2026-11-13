// Which windows have a native dialog open over them, so an agent's close or
// quit leaves the window to the user meanwhile (ADR 0052). It wraps
// Electron's window-modal dialog calls once at startup, so every call site
// counts, present and future. Sync dialogs block main, so no command runs
// under one.
const WINDOW_DIALOGS = [
  "showMessageBox",
  "showOpenDialog",
  "showSaveDialog",
] as const;

type DialogCall = (...args: never[]) => Promise<unknown>;
export type DialogModule = Record<(typeof WINDOW_DIALOGS)[number], DialogCall>;

export function trackWindowDialogs(dialog: DialogModule) {
  const open = new WeakMap<object, number>();
  for (const name of WINDOW_DIALOGS) {
    const original = dialog[name].bind(dialog) as (
      ...args: unknown[]
    ) => Promise<unknown>;
    // With two arguments, the first is the window the dialog belongs to.
    const tracked = (...args: unknown[]) => {
      const owner = args.length > 1 ? args[0] : undefined;
      if (typeof owner !== "object" || owner === null) return original(...args);
      open.set(owner, (open.get(owner) ?? 0) + 1);
      const settle = () => {
        const count = (open.get(owner) ?? 1) - 1;
        if (count > 0) open.set(owner, count);
        else open.delete(owner);
      };
      try {
        return original(...args).finally(settle);
      } catch (error) {
        settle();
        throw error;
      }
    };
    dialog[name] = tracked as DialogCall;
  }
  return {
    hasOpenDialog: (window: object) => (open.get(window) ?? 0) > 0,
  };
}
