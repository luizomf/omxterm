// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createRendererLanguage } from "../../src/renderer/renderer-language";
import {
  isSettingsChange,
  type SettingsResult,
} from "../../src/shared/settings";
import {
  base,
  deferred,
  installSettingsDom,
  open,
  saved,
} from "../fixtures/settings-dialog-dom";

beforeAll(installSettingsDom);
afterEach(() => document.body.replaceChildren());

it("exposes labelled native background controls near themes without writing on open", async () => {
  const view = await open();
  view.query<HTMLButtonElement>("#settings-tab-appearance").click();
  const slider = view.field("Background transparency");
  expect(slider.type).toBe("range");
  expect([slider.min, slider.max, slider.step, slider.value]).toEqual([
    "0",
    "1",
    "0.01",
    "0",
  ]);
  expect(slider.getAttribute("aria-valuetext")).toBe("0%");
  expect(slider.getAttribute("aria-describedby")).toBe(
    "settings-background-hint",
  );
  const blur = view.field("Blur desktop background");
  expect(blur.type).toBe("checkbox");
  expect(blur.checked).toBe(false);
  expect(blur.getAttribute("aria-describedby")).toBe(
    "settings-background-hint",
  );
  expect(view.bridge.change).not.toHaveBeenCalled();
  slider.value = "0.37";
  slider.dispatchEvent(new Event("input"));
  expect(slider.getAttribute("aria-valuetext")).toBe("37%");
  expect(view.query(".settings-range-value").textContent).toBe("37%");
  slider.dispatchEvent(new Event("change"));
  await view.settle();
  expect(view.bridge.change).toHaveBeenCalledExactlyOnceWith({
    path: "window.transparency",
    value: 0.37,
  });
  // Even after settlement, release/no-op input does not write again.
  slider.dispatchEvent(new Event("change"));
  expect(view.bridge.change).toHaveBeenCalledOnce();
  blur.checked = true;
  blur.dispatchEvent(new Event("change"));
  await view.settle();
  expect(view.bridge.change).toHaveBeenLastCalledWith({
    path: "window.blur",
    value: true,
  });
  expect(view.status()).toBe("Saved.");
  view.dialog.dispose();
});

it.each(["rejected", "conflict", "failed", "transport"] as const)(
  "retains newer adjustment and reconciles the final %s outcome truthfully",
  async (outcome) => {
    const first = deferred<SettingsResult>();
    const last = deferred<SettingsResult>();
    const view = await open({
      change: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(last.promise),
    });
    const slider = view.field("Background transparency");
    slider.value = "0.2";
    slider.dispatchEvent(new Event("input"));
    slider.value = "0.8";
    slider.dispatchEvent(new Event("input"));
    first.resolve(
      saved({
        ...base,
        values: { ...base.values, "window.transparency": 0.2 },
      }),
    );
    await view.settle();
    expect(slider.value).toBe("0.8");
    expect(slider.getAttribute("aria-valuetext")).toBe("80%");
    expect(view.status()).toBe("Saving…");
    if (outcome === "transport") last.reject(new Error("transport"));
    else
      last.resolve({
        status: outcome,
        message: { kind: "conflict" },
        snapshot: base,
      });
    await view.settle();
    expect(slider.value).toBe(outcome === "transport" ? "0.2" : "0");
    expect(view.query(".settings-status").dataset.severity).toBe("error");
    expect(view.status()).not.toBe("Saved.");
    view.dialog.dispose();
  },
);

it("relabels pending controls in place and keeps saved-but-not-applied feedback", async () => {
  const language = createRendererLanguage("en-US");
  const pending = deferred<SettingsResult>();
  const view = await open({ change: vi.fn(() => pending.promise) }, language);
  const slider = view.field("Background transparency");
  slider.focus();
  slider.value = "1";
  slider.dispatchEvent(new Event("input"));
  language.set("pt-BR");
  expect(view.field("Transparência do fundo")).toBe(slider);
  expect(document.activeElement).toBe(slider);
  expect(slider.getAttribute("aria-valuetext")).toBe("100%");
  expect(view.field("Desfocar o fundo da área de trabalho").type).toBe(
    "checkbox",
  );
  pending.resolve(
    saved(
      { ...base, values: { ...base.values, "window.transparency": 1 } },
      { applied: false, notice: { kind: "application" } },
    ),
  );
  await view.settle();
  expect(slider.value).toBe("1");
  expect(view.query(".settings-status").dataset.severity).toBe("error");
  expect(view.status()).toContain("Salvo em config.json");
  expect(view.bridge.change).toHaveBeenCalledOnce();
  view.dialog.dispose();
});

it("submits the final adjustment before close and ignores its retired response", async () => {
  const pending = deferred<SettingsResult>();
  const view = await open({ change: vi.fn(() => pending.promise) });
  const slider = view.field("Background transparency");
  slider.value = "0.91";
  slider.dispatchEvent(new Event("input"));
  view.dialog.dispose();
  expect(view.bridge.change).toHaveBeenCalledExactlyOnceWith({
    path: "window.transparency",
    value: 0.91,
  });
  pending.resolve(saved(base));
  await view.settle();
  expect(document.querySelector(".settings-dialog")).toBeNull();
});

it.each([0, 0.001, 0.5, 1])(
  "accepts finite transparency %s at the typed boundary",
  (value) => {
    expect(isSettingsChange({ path: "window.transparency", value })).toBe(true);
  },
);
it.each([-0.01, 1.01, NaN, Infinity, "0.5", false])(
  "rejects invalid transparency %s",
  (value) => {
    expect(isSettingsChange({ path: "window.transparency", value })).toBe(
      false,
    );
  },
);
it("accepts only boolean blur or explicit inheritance", () => {
  for (const value of [true, false, null])
    expect(isSettingsChange({ path: "window.blur", value })).toBe(true);
  for (const value of [0, 1, "true"])
    expect(isSettingsChange({ path: "window.blur", value })).toBe(false);
});
