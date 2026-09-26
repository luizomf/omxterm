export interface WindowChromeState {
  readonly style: "native" | "custom";
  readonly titleBarVisible: boolean;
  readonly fullScreen: boolean;
  readonly maximized: boolean;
  readonly handleVisible: boolean;
  readonly title: string;
}

export type WindowChromeCommand =
  | "sync"
  | "toggle-title-bar"
  | "minimize"
  | "maximize"
  | "close"
  | "preview-active"
  | "preview-inactive";

export function isWindowChromeCommand(
  value: unknown,
): value is WindowChromeCommand {
  return (
    typeof value === "string" &&
    [
      "sync",
      "toggle-title-bar",
      "minimize",
      "maximize",
      "close",
      "preview-active",
      "preview-inactive",
    ].includes(value)
  );
}

export function isWindowChromeState(
  value: unknown,
): value is WindowChromeState {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const state = value as Record<string, unknown>;
  return (
    Object.keys(state).length === 6 &&
    (state.style === "native" || state.style === "custom") &&
    typeof state.titleBarVisible === "boolean" &&
    typeof state.fullScreen === "boolean" &&
    typeof state.maximized === "boolean" &&
    typeof state.handleVisible === "boolean" &&
    typeof state.title === "string" &&
    [...state.title].length <= 258 &&
    !/[\p{Cc}\p{Cf}\p{Cs}\p{Cn}\p{Zl}\p{Zp}]/u.test(state.title)
  );
}
