import { describe, expect, it } from "vitest";
import { isTerminalTabCommand } from "../../src/shared/terminal-contract";
import {
  isTerminalPaneCommand,
  isTerminalSessionStart,
  isTerminalTabSelection,
  isWorkingDirectoryUri,
  localWorkingDirectory,
  MAX_PANES_PER_TAB,
} from "../../src/shared/terminal-panes";

describe("pane contract", () => {
  it("accepts only exact pane commands, also as tab commands", () => {
    for (const command of [
      { action: "split", direction: "right" },
      { action: "split", direction: "down" },
      { action: "focus-pane", target: "next" },
      { action: "focus-pane", target: "up" },
      { action: "equalize-panes" },
      { action: "close-pane" },
      { action: "prepare-close-pane" },
      { action: "resolve-close-pane", confirmed: false },
    ]) {
      expect(isTerminalPaneCommand(command)).toBe(true);
      expect(isTerminalTabCommand(command)).toBe(true);
    }
    for (const command of [
      { action: "split", direction: "left" },
      { action: "split" },
      { action: "focus-pane", target: "first" },
      { action: "close-pane", sessionId: "s1" },
      { action: "resolve-close-pane", confirmed: "yes" },
      { action: "equalize-panes", extra: true },
    ])
      expect(isTerminalTabCommand(command)).toBe(false);
  });

  it("validates tab selections with the focused session among the tab's", () => {
    expect(isTerminalTabSelection({ sessionId: "s1" })).toBe(true);
    expect(
      isTerminalTabSelection({ sessionId: "s2", tabSessionIds: ["s1", "s2"] }),
    ).toBe(true);
    expect(
      isTerminalTabSelection({ sessionId: null, tabSessionIds: ["s1"] }),
    ).toBe(true);
    expect(isTerminalTabSelection({ sessionId: null, tabSessionIds: [] })).toBe(
      true,
    );
    for (const value of [
      { sessionId: null },
      { sessionId: undefined, tabSessionIds: [] },
      { sessionId: null, tabSessionIds: ["bad-id"] },
      { sessionId: "s2", tabSessionIds: ["s1"] },
      { sessionId: "s1", tabSessionIds: [] },
      { sessionId: "s1", tabSessionIds: ["s1", "x"] },
      {
        sessionId: "s1",
        tabSessionIds: Array.from(
          { length: MAX_PANES_PER_TAB + 1 },
          (_, index) => `s${index + 1}`,
        ),
      },
      { sessionId: "s1", tabSessionIds: ["s1"], extra: 1 },
    ])
      expect(isTerminalTabSelection(value)).toBe(false);
  });

  it("validates pane starts and OSC 7 reports without accepting paths", () => {
    const surface = (value: unknown) => value === "f1";
    expect(isTerminalSessionStart({ workingDirectoryOf: "s3" }, surface)).toBe(
      true,
    );
    expect(
      isTerminalSessionStart(
        { surfaceId: "f1", workingDirectoryOf: "s3" },
        surface,
      ),
    ).toBe(true);
    for (const value of [
      {},
      { workingDirectory: "/tmp" },
      { workingDirectoryOf: "/tmp" },
      { surfaceId: "nope" },
      "s1",
    ])
      expect(isTerminalSessionStart(value, surface)).toBe(false);
    expect(isWorkingDirectoryUri("file://host/home/user")).toBe(true);
    for (const uri of [
      "https://host/x",
      "file:relative",
      "file://host/a\u0007b",
      `file:///${"a".repeat(4_100)}`,
    ])
      expect(isWorkingDirectoryUri(uri)).toBe(false);
  });

  it.each([
    ["file:///home/user/My%20Work", "linux", "/home/user/My Work"],
    ["file://localhost/srv", "darwin", "/srv"],
    ["file://Workstation/var/tmp", "linux", "/var/tmp"],
    ["file:///C:/Users/me/src", "win32", "C:\\Users\\me\\src"],
    ["file:///D:", "win32", "D:\\"],
  ])("resolves the local report %s on %s", (uri, platform, expected) => {
    expect(localWorkingDirectory(uri, "workstation", platform)).toBe(expected);
  });

  it.each([
    ["file://remote-host/home/user", "linux"],
    ["file:///home/user?x=1", "linux"],
    ["file:///home/%ZZ", "linux"],
    ["file:///home/a%00b", "linux"],
    ["file://server/share/dir", "win32"],
    ["file:///share/dir", "win32"],
  ])("never treats %s on %s as a local directory", (uri, platform) => {
    expect(localWorkingDirectory(uri, "workstation", platform)).toBeUndefined();
  });
});
