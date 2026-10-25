import { expect, it, vi } from "vitest";
import {
  assertShortcutCollision,
  createShortcutPtyObservation,
  shortcutCaptureLaunchRequest,
} from "../fixtures/settings-shortcut-native";

vi.mock("electron", () => ({ Menu: {}, ipcMain: {} }));

it("recognizes the loader's actual quoted-field collision diagnostic, not an invented status prefix", () => {
  expect(() =>
    assertShortcutCollision(
      'User Configuration "/synthetic/config.json" at "keybinds.find": conflicts with the "toggleFullScreen" keybind on F11. Choose another shortcut for one of them, or set one of them to null to disable its shortcut.',
    ),
  ).not.toThrow();
  expect(() => assertShortcutCollision("Saved.")).toThrow();
  expect(() => assertShortcutCollision("Recording cancelled.")).toThrow();
});

it("observes actual child-reported bytes across arbitrary native output chunks", () => {
  const observation = createShortcutPtyObservation();
  observation.observe(
    "__EXPLICIT_READY__Olá🙂\n\u001b[?1004l\u001b[>3u\u001b[?u__SHORTCUT_P",
  );
  expect(observation.input()).toBe("");
  observation.observe("TY__1b5b3f3375\n__SHORTCUT_PTY__1b5b32373b313a3175\r");
  expect(observation.input()).toBe("\u001b[?3u");
  observation.observe("\n__SHORTCUT_PTY__1b5b32373b313a3375\n");
  expect(observation.input()).toBe("\u001b[?3u\u001b[27;1:1u\u001b[27;1:3u");
});

it("does not hide malformed or excessive native child reports", () => {
  expect(() =>
    createShortcutPtyObservation().observe("__SHORTCUT_PTY__0\n"),
  ).toThrow();
  expect(() =>
    createShortcutPtyObservation().observe("__SHORTCUT_PTY__not-hex\n"),
  ).toThrow();
  expect(() =>
    createShortcutPtyObservation().observe("x".repeat(65_537)),
  ).toThrow("fixture budget");
  expect(() =>
    createShortcutPtyObservation().observe(
      "__SHORTCUT_PTY__" + "00".repeat(16_385) + "\n",
    ),
  ).toThrow("fixture budget");
});

it("launches the reporting raw PTY child directly without a shell", () => {
  const launch = shortcutCaptureLaunchRequest();
  expect(launch.kind).toBe("explicit-command");
  expect(launch.executable).toBe("/usr/bin/python3");
  expect(launch.arguments.slice(0, 2)).toEqual(["-u", "-c"]);
  expect(launch.arguments).toHaveLength(3);
  expect(launch.arguments[2]!.length).toBeGreaterThan(0);
});
