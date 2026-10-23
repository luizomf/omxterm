import {
  app,
  BrowserWindow,
  screen,
  type BrowserWindowConstructorOptions,
} from "electron";
import { resolveApplicationDataDirectory } from "./application-data";
import { createWindowPlacement } from "./window-placement";

// Opens each new window on the display the user works on, at the size and
// spot last used there (window-placement.json in Application Data).
export async function startWindowPlacement(homeDirectory: string) {
  const placement = createWindowPlacement({
    directory: resolveApplicationDataDirectory(process.env, homeDirectory),
    screen: () => screen,
    platform: process.platform,
    environment: process.env,
    onWindows: () => BrowserWindow.getAllWindows(),
  });
  await placement.load();
  app.on("will-quit", () => placement.flush());
  return {
    // Finds the display first, then opens the window.
    preparing<Application extends { newWindow(): Promise<void> }>(
      application: Application,
    ): Application {
      const wrapped = Object.create(application) as Application;
      wrapped.newWindow = async () => {
        await placement.prepare().catch(() => {});
        return application.newWindow();
      };
      return wrapped;
    },
    // A BrowserWindow placed on the prepared display and remembered there.
    create(options: BrowserWindowConstructorOptions): BrowserWindow {
      const placed = placement.next(
        { width: options.width ?? 960, height: options.height ?? 640 },
        { width: options.minWidth ?? 0, height: options.minHeight ?? 0 },
      );
      const window = new BrowserWindow({
        ...options,
        x: placed.x,
        y: placed.y,
        width: placed.width,
        height: placed.height,
      });
      placement.track(window, placed);
      return window;
    },
  };
}
