// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountWindowChrome } from "../../src/renderer/window-chrome";
import type { WindowChromeState } from "../../src/shared/window-chrome";

afterEach(() => {
  document.body.replaceChildren();
  document.body.className = "";
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
