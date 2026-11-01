/** Only the primary theme window contributes session identities to its tool. */
export function createThemeSessionTracking<Window>(
  primary: () => Window | undefined,
  target: () =>
    | {
        started(id: string): void;
        selected(id: string | null): void;
        ended(id: string): void;
      }
    | undefined,
) {
  return {
    started(window: Window, id: string) {
      if (window === primary()) target()?.started(id);
    },
    selected(window: Window, id: string | null) {
      if (window === primary()) target()?.selected(id);
    },
    ended(window: Window, id: string) {
      if (window === primary()) target()?.ended(id);
    },
  };
}
