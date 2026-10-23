// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installWheelZoom } from "../../src/renderer/wheel-zoom";
import { createTabStrip } from "../../src/renderer/tab-strip";
import { createHeaderToolbar } from "../../src/renderer/header-toolbar";
import { createTranslator } from "../../src/shared/i18n";

afterEach(() => {
  document.body.replaceChildren();
});

const wheel = (init: WheelEventInit) =>
  new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });

describe("Ctrl+wheel zoom", () => {
  it("zooms one step per wheel notch and leaves plain scrolling alone", () => {
    const container = document.createElement("div");
    const inner = document.createElement("canvas");
    container.append(inner);
    document.body.append(container);
    const zoom = vi.fn<(command: string) => void>();
    const scrolled = vi.fn();
    inner.addEventListener("wheel", scrolled);
    const remove = installWheelZoom(container, zoom);

    const up = wheel({ deltaY: -100, ctrlKey: true });
    inner.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    inner.dispatchEvent(wheel({ deltaY: 100, metaKey: true }));
    inner.dispatchEvent(wheel({ deltaY: 40, ctrlKey: true }));
    inner.dispatchEvent(wheel({ deltaY: 60, ctrlKey: true }));
    expect(zoom.mock.calls.map(([command]) => command)).toEqual([
      "in",
      "out",
      "out",
    ]);
    expect(scrolled).not.toHaveBeenCalled();

    inner.dispatchEvent(wheel({ deltaY: 100 }));
    expect(scrolled).toHaveBeenCalledOnce();
    remove();
    inner.dispatchEvent(wheel({ deltaY: -100, ctrlKey: true }));
    expect(zoom).toHaveBeenCalledTimes(3);
  });
});

describe("tab strip scrolling", () => {
  it("scrolls sideways with the wheel only when tabs overflow", () => {
    const strip = document.createElement("nav");
    document.body.append(strip);
    const tabs = createTabStrip<number>(strip, {
      describe: (tab) => ({ label: `Tab ${tab}`, paneCount: 1 }),
      onSelect: vi.fn(),
      onReorder: vi.fn(),
    });
    tabs.render([1, 2, 3], 2, true);
    Object.defineProperty(strip, "clientWidth", { value: 300 });
    const fits = wheel({ deltaY: 120 });
    Object.defineProperty(strip, "scrollWidth", {
      value: 300,
      configurable: true,
    });
    strip.dispatchEvent(fits);
    expect(fits.defaultPrevented).toBe(false);

    Object.defineProperty(strip, "scrollWidth", { value: 900 });
    const overflow = wheel({ deltaY: 120 });
    strip.dispatchEvent(overflow);
    expect(overflow.defaultPrevented).toBe(true);
    expect(strip.scrollLeft).toBe(120);
    tabs.dispose();
  });
});

describe("Open Tabs button", () => {
  it("opens the tab list below itself", () => {
    const openTabs = vi.fn();
    const toolbar = createHeaderToolbar(document, {
      translator: createTranslator("pt-BR"),
      runAction: vi.fn(),
      openMainMenu: vi.fn(),
      openTabs,
      hasCommands: false,
    });
    document.body.append(toolbar.trailing);
    const button = toolbar.trailing.querySelector<HTMLButtonElement>(
      '[aria-label="Abas Abertas"]',
    )!;
    button.getBoundingClientRect = () =>
      ({ left: 700.2, bottom: 33.7 }) as DOMRect;
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    button.click();
    expect(openTabs).toHaveBeenCalledWith({ x: 700, y: 34 });
  });
});
