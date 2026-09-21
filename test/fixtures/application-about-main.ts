import { app, dialog, Menu, nativeImage } from "electron";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const [entry, resultPath, resourcesPath] = process.argv.slice(-3);
if (!entry || !resultPath || !resourcesPath)
  throw new Error("About fixture arguments missing");
if (resourcesPath !== "development") {
  // Exercise packaged resource resolution at the Electron boundary. This does
  // not replace the separate exact-package About verification.
  Object.defineProperty(app, "isPackaged", { get: () => true });
  Object.defineProperty(process, "resourcesPath", { value: resourcesPath });
}

let options: Parameters<typeof app.setAboutPanelOptions>[0] | undefined;
let configuredWhileReady = false;
const setAbout = app.setAboutPanelOptions.bind(app);
app.setAboutPanelOptions = (value) => {
  options = value;
  configuredWhileReady = app.isReady();
  setAbout(value);
};

// Observe the actual application startup at Electron's menu boundary, before
// a window or PTY exists. No internal application module is replaced.
const setMenu = Menu.setApplicationMenu.bind(Menu);
Menu.setApplicationMenu = (menu) => {
  const items = menu?.items.flatMap((item) => item.submenu?.items ?? []) ?? [];
  // Electron's default-app launcher may install its own menu first.
  if (!items.some((item) => item.label === "Reload User Configuration")) {
    setMenu(menu);
    return;
  }
  const about = items.find((item) => item.role === "about");
  const icon = options?.iconPath
    ? nativeImage.createFromPath(options.iconPath)
    : undefined;
  writeFileSync(
    resultPath,
    JSON.stringify({
      options: options ?? null,
      configuredWhileReady,
      version: app.getVersion(),
      nativeAboutRole: about?.role,
      iconSize: icon?.getSize(),
      iconEmpty: icon?.isEmpty(),
    }),
  );
  app.exit(0);
};

dialog.showErrorBox = (title, content) => {
  process.stderr.write(`${title}: ${content}\n`);
  app.exit(1);
};
setTimeout(() => {
  process.stderr.write(`About startup timed out (ready: ${app.isReady()})\n`);
  app.exit(2);
}, 15_000).unref();
await import(pathToFileURL(entry).href).catch((error: unknown) => {
  process.stderr.write(String(error));
  app.exit(1);
});
