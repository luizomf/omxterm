import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import path from "node:path";
import { expect, it } from "vitest";

it("refuses a late arm when the packaged application already created a window", () => {
  const app = Object.assign(new EventEmitter(), {
    isPackaged: true,
    getVersion: () => "1",
    getAppPath: () => "/stage/resources/app.asar",
  });
  const electron = {
    app,
    ipcMain: new EventEmitter(),
    BrowserWindow: { getAllWindows: () => [{}] },
    webContents: {},
  };
  const module = { exports: {} as { arm(options: object): unknown } };
  const source = readFileSync(
    "test/fixtures/snippets-windows-exact-observer.cjs",
    "utf8",
  );
  runInNewContext(source, {
    module,
    require(name: string) {
      if (name === "electron") return electron;
      if (name === "node:assert/strict") return assert;
      if (name === "node:path") return path;
      if (name.startsWith("./")) return {};
      return require(name) as unknown;
    },
    process: {
      platform: "win32",
      arch: "arm64",
      pid: 41,
      execPath: "/stage/OMXTerm.exe",
      versions: { electron: "43.8.1" },
    },
  });
  expect(() =>
    module.exports.arm({
      version: "1",
      asar: "/stage/resources/app.asar",
      executable: "/stage/OMXTerm.exe",
      electronVersion: "43.8.1",
    }),
  ).toThrow("before any window");
});

it.each([
  "unpackaged",
  "version",
  "asar",
  "executable",
  "electron",
  "architecture",
])("refuses %s identity before observing the packaged process", (wrong) => {
  const app = Object.assign(new EventEmitter(), {
    isPackaged: wrong !== "unpackaged",
    getVersion: () => (wrong === "version" ? "2" : "1"),
    getAppPath: () =>
      wrong === "asar" ? "/wrong/app.asar" : "/stage/resources/app.asar",
  });
  const module = { exports: {} as { arm(options: object): unknown } };
  const source = readFileSync(
    "test/fixtures/snippets-windows-exact-observer.cjs",
    "utf8",
  );
  runInNewContext(source, {
    module,
    require(name: string) {
      if (name === "electron")
        return {
          app,
          ipcMain: new EventEmitter(),
          BrowserWindow: { getAllWindows: () => [] },
          webContents: {},
        };
      if (name === "node:assert/strict") return assert;
      if (name === "node:path") return path;
      if (name.startsWith("./")) return {};
      return require(name) as unknown;
    },
    process: {
      platform: "win32",
      arch: wrong === "architecture" ? "x64" : "arm64",
      pid: 41,
      execPath: wrong === "executable" ? "/wrong.exe" : "/stage/OMXTerm.exe",
      versions: { electron: wrong === "electron" ? "wrong" : "43.8.1" },
    },
  });
  expect(() =>
    module.exports.arm({
      version: "1",
      asar: "/stage/resources/app.asar",
      executable: "/stage/OMXTerm.exe",
      electronVersion: "43.8.1",
    }),
  ).toThrow();
});
