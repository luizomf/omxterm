import { execFileSync } from "node:child_process";
import type { BrowserWindow } from "electron";
import type { UserConfiguration } from "../shared/user-configuration";

type NativeWindow = Pick<
  BrowserWindow,
  | "isDestroyed"
  | "getNativeWindowHandle"
  | "setVibrancy"
  | "setBackgroundMaterial"
>;
type BackgroundConfiguration = Pick<UserConfiguration, "blur" | "transparency">;
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
    ): void {
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
  },
) {
  let disposed = false;
  let requested = false;
  const apply = ({ blur, transparency }: BackgroundConfiguration): void => {
    if (disposed || window.isDestroyed()) return;
    const enabled = blur && transparency > 0;
    if (requested === enabled) return;
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
      // A later manual reload may retry a failed transition. No background retry.
      // Optional visual effects never prevent a usable terminal. No helper,
      // API support or visible compositor response is a launch prerequisite.
    }
  };
  return {
    apply,
    dispose(): void {
      if (disposed) return;
      if (requested) apply({ blur: false, transparency: 0 });
      disposed = true;
    },
  };
}
