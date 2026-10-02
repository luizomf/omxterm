import { app, dialog, Menu, nativeImage } from "electron";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { spawnFixtureProcess } from "./native-fixture-ownership";
import { fixtureProcesses } from "./native-fixture-processes";
import { createAboutDiagnostics } from "./application-about-diagnostics";

const diagnosticArgument = "--fixture-about-diagnostics=";
const diagnostics = createAboutDiagnostics(
  process.argv
    .find((argument) => argument.startsWith(diagnosticArgument))
    ?.slice(diagnosticArgument.length),
);
diagnostics.enter("bootstrap");
try {
  // Observe the real production detached spawn without changing its arguments,
  // streams or exit ordering. Register before production can abandon its leader.
  childProcess.spawn = new Proxy(childProcess.spawn, {
    apply(target, receiver, argumentsList) {
      diagnostics.enter("relaunch-registration");
      try {
        return spawnFixtureProcess(() => {
          const child = Reflect.apply(
            target,
            receiver,
            argumentsList,
          ) as childProcess.ChildProcess;
          if (!child.pid) throw new Error("About relaunch produced no process");
          return child as childProcess.ChildProcess & { readonly pid: number };
        });
      } catch (error) {
        diagnostics.failure(error);
        throw error;
      }
    },
  });
  syncBuiltinESMExports();

  const [entry, resultPath, resourcesPath] = process.argv
    .filter(
      (argument) =>
        !argument.startsWith("--ozone-platform=") &&
        !argument.startsWith("--fixture-"),
    )
    .slice(-3);
  if (!entry || !resultPath || !resourcesPath)
    throw new Error("About fixture arguments missing");
  const initialPath = `${resultPath}.initial`;
  if (!existsSync(initialPath))
    writeFileSync(initialPath, String(process.pid), { flag: "wx" });
  const relaunched = Number(readFileSync(initialPath, "utf8")) !== process.pid;
  diagnostics.replacement(relaunched);
  diagnostics.enter("producer-identity");
  const producer = fixtureProcesses().find((row) => row.pid === process.pid);
  if (!producer) throw new Error("About result producer identity is missing");
  let observation: string | undefined;
  process.once("exit", (exitCode) => {
    if (!observation) return;
    diagnostics.enter("completion-publication");
    try {
      const completionPath = `${resultPath}.completion`;
      writeFileSync(
        `${completionPath}.tmp`,
        JSON.stringify({ producer, exitCode, stdout: observation }),
      );
      renameSync(`${completionPath}.tmp`, completionPath);
    } catch (error) {
      diagnostics.failure(error);
      throw error;
    }
  });
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
    const items =
      menu?.items.flatMap((item) => item.submenu?.items ?? []) ?? [];
    // Electron's default-app launcher may install its own menu first.
    if (!items.some((item) => item.label === "Reload User Configuration")) {
      setMenu(menu);
      return;
    }
    diagnostics.enter("menu-observation");
    if (process.argv.includes("--fixture-missing-result")) {
      app.quit();
      return;
    }
    const about = items.find((item) => item.role === "about");
    const icon = options?.iconPath
      ? nativeImage.createFromPath(options.iconPath)
      : undefined;
    observation = JSON.stringify({
      relaunched,
      backend: app.commandLine.getSwitchValue("ozone-platform"),
      options: options ?? null,
      configuredWhileReady,
      version: app.getVersion(),
      nativeAboutRole: about?.role,
      iconSize: icon?.getSize(),
      iconEmpty: icon?.isEmpty(),
    });
    diagnostics.enter("observation-publication");
    try {
      writeFileSync(`${resultPath}.tmp`, observation);
      renameSync(`${resultPath}.tmp`, resultPath);
    } catch (error) {
      diagnostics.failure(error);
      throw error;
    }
    if (process.argv.includes("--fixture-published-failure")) app.exit(3);
    if (process.argv.includes("--fixture-published-hang"))
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
    // Mark production startup as quitting before this menu callback returns.
    // An immediate exit request alone can still let it create the first window.
    app.quit();
  };

  dialog.showErrorBox = (title, content) => {
    diagnostics.enter("startup-dialog");
    diagnostics.failure(undefined);
    process.stderr.write(`${title}: ${content}\n`);
    app.exit(1);
  };
  setTimeout(() => {
    diagnostics.enter("watchdog");
    diagnostics.failure({ code: "ETIMEDOUT" });
    process.stderr.write(`About startup timed out (ready: ${app.isReady()})\n`);
    app.exit(2);
  }, 15_000).unref();
  diagnostics.enter("production-import");
  await import(pathToFileURL(entry).href).catch((error: unknown) => {
    diagnostics.failure(error);
    process.stderr.write(String(error));
    app.exit(1);
  });
} catch (error) {
  diagnostics.failure(error);
  throw error;
}
