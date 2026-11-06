// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  assertSettingsLayout,
  observeSettingsLayout,
} from "../fixtures/settings-layout-observation";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it.each(["panel", "category"])(
  "retains an extra %s through observation so the inventory oracle rejects it",
  (extra) => {
    const ids = [
      "general",
      "appearance",
      "terminal",
      "window",
      "shortcuts",
      "config-file",
      "extensions",
    ];
    document.body.innerHTML = `<div class="settings-dialog"><div class="settings-tabs"></div><div class="settings-panels" style="padding: 0px"></div></div>`;
    // jsdom does not load the production stylesheet in this inventory-only test.
    const tabs = document.querySelector<HTMLElement>(".settings-tabs")!;
    tabs.style.display = "flex";
    const panels = document.querySelector<HTMLElement>(".settings-panels")!;
    for (const id of ids) {
      const selected = id === "config-file";
      const tab = document.createElement("button");
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", `settings-panel-${id}`);
      tab.setAttribute("aria-selected", String(selected));
      tabs.append(tab);
      const panel = document.createElement("section");
      panel.id = `settings-panel-${id}`;
      panel.className = "settings-panel";
      panel.hidden = !selected;
      panel.style.display = selected ? "block" : "none";
      panels.append(panel);
    }
    Object.defineProperty(panels, "clientWidth", { value: 400 });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 100,
      right: 400,
      width: 400,
      height: 100,
      toJSON: () => ({}),
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );
    expect(() =>
      assertSettingsLayout(
        observeSettingsLayout(false),
        "settings-panel-config-file",
      ),
    ).not.toThrow();
    if (extra === "panel") {
      const unexpected = document.createElement("section");
      unexpected.className = "settings-panel";
      unexpected.id = "settings-panel-unexpected";
      unexpected.style.display = "block"; // A second visible panel must not vanish.
      panels.append(unexpected);
    } else {
      const unexpected = document.createElement("button");
      unexpected.setAttribute("role", "tab");
      unexpected.setAttribute("aria-controls", "settings-panel-unexpected");
      tabs.append(unexpected);
    }
    const observation = observeSettingsLayout(false);
    expect(
      extra === "panel" ? observation.panels : observation.categories,
    ).toHaveLength(8);
    expect(() =>
      assertSettingsLayout(observation, "settings-panel-config-file"),
    ).toThrow(`${extra} inventory changed`);
  },
);
