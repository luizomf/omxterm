import { execFileSync } from "node:child_process";
import { release } from "node:os";
import type { BrowserWindow } from "electron";
import type { UserConfiguration } from "../shared/user-configuration";

type NativeWindow = Pick<
  BrowserWindow,
  | "isDestroyed"
  | "getNativeWindowHandle"
  | "setVibrancy"
  | "setBackgroundMaterial"
  | "setBackgroundColor"
>;
type BackgroundConfiguration = Pick<
  UserConfiguration,
  "blur" | "transparency" | "terminalTheme"
>;
const blurProperty = "_KDE_NET_WM_BLUR_BEHIND_REGION";

// Application-owned collection: registration consumes the current snapshot;
// subsequent commits reach every surviving window and close retires ownership.
export function createWindowBackgroundEffectsOwner(
  platform: string,
  displayBackend: string,
) {
  const owned = new Map<
    NativeWindow,
    ReturnType<typeof createWindowBackgroundEffects>
  >();
  return {
    register(
      window: NativeWindow & {
        once(event: "closed", listener: () => void): unknown;
      },
      configuration: BackgroundConfiguration,
    ): () => number {
      const effects = createWindowBackgroundEffects(window, {
        platform,
        x11: displayBackend === "x11",
      });
      owned.set(window, effects);
      effects.apply(configuration);
      window.once("closed", () => {
        effects.dispose();
        owned.delete(window);
      });
      return effects.transparency;
    },
    apply(configuration: BackgroundConfiguration): void {
      for (const effects of owned.values()) effects.apply(configuration);
    },
  };
}

// Owns no asynchronous work: a bounded synchronous xprop cannot outlive the
// window or race a newer reload and subsequently target a recycled XID.
export function createWindowBackgroundEffects(
  window: NativeWindow,
  options: {
    readonly platform: string;
    readonly x11?: boolean;
    readonly runXprop?: typeof execFileSync;
    readonly windowsVersion?: string;
  },
) {
  // Electron's material API is a no-op before Windows 11 22H2. This checks only
  // that API floor, never compositor policy or whether blur is visibly active.
  const windowsMaterialAvailable =
    options.platform === "win32" &&
    supportsWindowsMaterial(options.windowsVersion ?? release());
  let disposed = false;
  let requested: boolean | undefined = false;
  let current: BackgroundConfiguration | undefined;
  const apply = (configuration: BackgroundConfiguration): void => {
    if (disposed || window.isDestroyed()) return;
    current = configuration;
    const enabled =
      configuration.blur &&
      configuration.transparency > 0 &&
      (options.platform !== "win32" || windowsMaterialAvailable);
    if (requested !== enabled) {
      try {
        if (options.platform === "darwin")
          window.setVibrancy(enabled ? "under-window" : null);
        else if (options.platform === "win32")
          window.setBackgroundMaterial(enabled ? "acrylic" : "none");
        else if (options.platform === "linux" && options.x11) {
          const handle = window.getNativeWindowHandle();
          if (handle.length < 4) return;
          const xid = handle.readUInt32LE(0);
          if (xid === 0) return;
          (options.runXprop ?? execFileSync)(
            "xprop",
            [
              "-id",
              `0x${xid.toString(16)}`,
              ...(enabled
                ? ["-f", blurProperty, "32c", "-set", blurProperty, "0"]
                : ["-remove", blurProperty]),
            ],
            {
              timeout: 500,
              killSignal: "SIGKILL",
              maxBuffer: 1024,
              stdio: "ignore",
              windowsHide: true,
            },
          );
        }
        requested = enabled;
      } catch {
        // A failed call may have partially changed native state. Permit a later
        // committed reload or disposal to retry/clear it, never a timer.
        requested = undefined;
      }
    }
    if (options.platform === "win32") {
      try {
        // Normal native construction preserves resize/maximize/fullscreen. Plain
        // alpha is intentionally unavailable there; cover unsupported/failed
        // materials with the exact theme, including live theme-only reloads.
        window.setBackgroundColor(
          enabled && requested === true
            ? "#00000000"
            : configuration.terminalTheme.colors.background,
        );
      } catch {
        // Optional effects cannot prevent opening or using the terminal.
      }
    }
  };
  return {
    apply,
    transparency(): number {
      return options.platform === "win32" && requested !== true
        ? 0
        : (current?.transparency ?? 0);
    },
    dispose(): void {
      if (disposed) return;
      if (requested !== false && current)
        apply({ ...current, blur: false, transparency: 0 });
      disposed = true;
    },
  };
}

function supportsWindowsMaterial(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:\.|$)/u.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  return major > 10 || (major === 10 && Number(match[3]) >= 22621);
}
