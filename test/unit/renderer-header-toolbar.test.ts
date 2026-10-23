// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHeaderToolbar } from "../../src/renderer/header-toolbar";
import {
  mountWindowChrome,
  type WindowChromeBridge,
} from "../../src/renderer/window-chrome";
import { createTranslator } from "../../src/shared/i18n";
import type { WindowChromeState } from "../../src/shared/window-chrome";

function toolbar(hasCommands = true) {
  const runAction = vi.fn();
  const openMainMenu = vi.fn();
  const created = createHeaderToolbar(document, {
    translator: createTranslator("en"),
    runAction,
    openMainMenu,
    hasCommands,
  });
  return { toolbar: created, runAction, openMainMenu };
}

const labelled = (root: ParentNode, label: string) =>
  root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

function chromeBridge(style: WindowChromeState["style"]): WindowChromeBridge {
  return {
    windowChrome: vi.fn(),
    onWindowChrome(listener) {
      listener({
        style,
        titleBarVisible: true,
        fullScreen: false,
        maximized: false,
        handleVisible: false,
        title: "OMXTerm",
      });
      return () => {};
    },
    onTitleBarToggle: () => () => {},
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("header toolbar", () => {
  it("runs the named action of each button", () => {
    const { toolbar: created, runAction } = toolbar();
    document.body.append(created.leading, created.trailing);
    const expected = {
      Sessions: "toggleSessions",
      Commands: "toggleCommands",
      "Find in Terminal": "find",
      "Split Right": "splitRight",
      "Split Down": "splitDown",
      "Broadcast Input to Panes": "toggleBroadcast",
      "New Tab": "newTab",
    };
    for (const [label, action] of Object.entries(expected)) {
      labelled(document, label).click();
      expect(runAction).toHaveBeenLastCalledWith(action);
    }
    expect(runAction).toHaveBeenCalledTimes(7);
  });

  it("opens the main menu below its button", () => {
    const { toolbar: created, openMainMenu, runAction } = toolbar();
    document.body.append(created.trailing);
    const menu = labelled(document, "Main Menu");
    menu.getBoundingClientRect = () =>
      ({ left: 900.4, bottom: 33.6 }) as DOMRect;
    expect(menu.getAttribute("aria-haspopup")).toBe("menu");
    menu.click();
    expect(openMainMenu).toHaveBeenCalledWith({ x: 900, y: 34 });
    expect(runAction).not.toHaveBeenCalled();
  });

  it("keeps the terminal focused on pointer presses", () => {
    const { toolbar: created } = toolbar();
    document.body.append(created.leading);
    const press = new MouseEvent("mousedown", { cancelable: true });
    labelled(document, "Sessions").dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
  });

  it("shows pressed state for panels and broadcasting", () => {
    const { toolbar: created } = toolbar();
    document.body.append(created.leading);
    const sessions = labelled(document, "Sessions");
    expect(sessions.getAttribute("aria-pressed")).toBe("false");
    created.setPressed("sessions", true);
    created.setPressed("broadcast", true);
    expect(sessions.getAttribute("aria-pressed")).toBe("true");
    expect(
      labelled(document, "Broadcast Input to Panes").getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
    expect(labelled(document, "Split Right").hasAttribute("aria-pressed")).toBe(
      false,
    );
  });

  it("leaves out the Commands button without a Command Manager", () => {
    const { toolbar: created } = toolbar(false);
    document.body.append(created.leading);
    expect(labelled(document, "Commands")).toBeNull();
    expect(labelled(document, "Sessions")).not.toBeNull();
  });

  it("ignores clicks after disposal", () => {
    const { toolbar: created, runAction } = toolbar();
    const button = labelled(created.leading, "Sessions");
    created.dispose();
    button.click();
    expect(runAction).not.toHaveBeenCalled();
  });

  it("shares the custom title bar with the window controls", () => {
    const { toolbar: created } = toolbar();
    const chrome = mountWindowChrome(
      document,
      chromeBridge("custom"),
      () => {},
      created,
    );
    const row = document.querySelector(".window-title-bar")!;
    expect(row.classList.contains("with-toolbar")).toBe(true);
    expect([...row.children].map((child) => child.className)).toEqual([
      "header-toolbar-group",
      "window-title",
      "header-toolbar-group",
      "",
    ]);
    expect(
      document.querySelector<HTMLElement>(".window-toolbar-overlay"),
    ).toBeNull();
    chrome.dispose();
    expect(document.querySelector(".header-toolbar-group")).toBeNull();
  });

  it("overlays the native title inset beside macOS window controls", () => {
    const { toolbar: created } = toolbar();
    mountWindowChrome(document, chromeBridge("native"), () => {}, created);
    const overlay = document.querySelector<HTMLElement>(
      ".window-toolbar-overlay",
    )!;
    expect(overlay.hidden).toBe(false);
    expect(overlay.querySelectorAll(".header-toolbar-group")).toHaveLength(2);
    expect(
      document.querySelector<HTMLElement>(".window-title-bar")!.hidden,
    ).toBe(true);
  });
});
