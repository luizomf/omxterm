// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { mountWindowChrome } from "../../src/renderer/window-chrome";
import type { WindowChromeState } from "../../src/shared/window-chrome";
const surfaceCss = readFileSync("src/renderer/terminal-window.css", "utf8");
const chromeCss = readFileSync("src/renderer/window-chrome.css", "utf8");
const rule = (css: string, selector: string) =>
  [...css.matchAll(/([^{}]+)\{([^}]*)\}/gu)].find((match) =>
    match[1]!
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .split(",")
      .some((value) => value.trim() === selector),
  )?.[2];
afterEach(() => {
  document.body.replaceChildren();
  document.body.className = "";
});
it("gives Settings the same bounded native-title drag region without depending on a Surface", () => {
  const region = rule(surfaceCss, ".settings-tab::before");
  expect(region).toBeDefined();
  expect(region).toBe(rule(surfaceCss, ".terminal-surface::before"));
  for (const declaration of [
    'content: ""',
    "position: fixed",
    "top: 0",
    "left: 0",
    "right: 0",
    "height: var(--native-title-inset)",
    "app-region: drag",
  ])
    expect(region).toContain(declaration);
  expect(
    rule(chromeCss, "body.window-preview-active .settings-tab::before"),
  ).toContain("app-region: no-drag");
  expect(rule(surfaceCss, "#tab-strip")).toContain("app-region: no-drag");
  expect(rule(chromeCss, ".window-title-bar nav")).toContain(
    "app-region: no-drag",
  );
});
it.each(["native", "custom"] as const)(
  "keeps %s title, hidden/fullscreen and preview bounds with only graphical content",
  (style) => {
    document.body.innerHTML = '<main class="settings-tab"></main>';
    let state: WindowChromeState = {
      style,
      title: "Settings",
      titleBarVisible: true,
      fullScreen: false,
      maximized: false,
      handleVisible: true,
    };
    let update!: (state: WindowChromeState) => void;
    const chrome = mountWindowChrome(
      document,
      {
        windowChrome: vi.fn(),
        onWindowChrome(listener) {
          update = listener;
          listener(state);
          return () => {};
        },
        onTitleBarToggle: () => () => {},
      },
      () => {},
    );
    const inset = () =>
      document.documentElement.style.getPropertyValue("--native-title-inset");
    try {
      expect(document.querySelector(".terminal-surface")).toBeNull();
      for (const stripVisible of [false, true]) {
        document.body.classList.toggle("tabs-visible", stripVisible);
        expect(inset()).toBe(style === "native" ? "30px" : "0px");
        state = { ...state, fullScreen: true };
        update(state);
        expect(inset()).toBe("0px");
        state = { ...state, fullScreen: false, titleBarVisible: false };
        update(state);
        expect(inset()).toBe("0px");
        expect(
          document.querySelector<HTMLElement>(".window-drag-handle")!.hidden,
        ).toBe(false);
        state = { ...state, titleBarVisible: true };
        update(state);
        chrome.setPreviewActive(true);
        expect(document.body.classList.contains("window-preview-active")).toBe(
          true,
        );
        expect(
          document.querySelector<HTMLElement>(".window-drag-handle")!.hidden,
        ).toBe(true);
        expect(inset()).toBe(style === "native" ? "30px" : "0px");
        chrome.setPreviewActive(false);
        expect(document.body.classList.contains("window-preview-active")).toBe(
          false,
        );
      }
    } finally {
      chrome.dispose();
    }
  },
);
