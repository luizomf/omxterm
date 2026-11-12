// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createRendererLanguage } from "../../src/renderer/renderer-language";
import { createStateMarks } from "../../src/renderer/state-marks";
import { createLayoutSaveNotice } from "../../src/renderer/layout-save-notice";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function setup() {
  const marks = createStateMarks(document, createRendererLanguage(), () => {});
  const saved = createLayoutSaveNotice(marks);
  const notice = () => document.querySelector<HTMLElement>(".state-notice")!;
  return { saved, notice };
}

it("confirms a save with one sentence that goes away by itself", () => {
  vi.useFakeTimers();
  const { saved, notice } = setup();
  saved("saved");
  expect(notice().hidden).toBe(false);
  expect(notice().textContent).toContain("Layout saved.");
  vi.advanceTimersByTime(4000);
  expect(notice().hidden).toBe(true);
});

it("keeps a failure until dismissed, and a later save replaces it", () => {
  vi.useFakeTimers();
  const { saved, notice } = setup();
  saved("failed");
  expect(notice().textContent).toContain("Couldn't save this window's layout.");
  vi.advanceTimersByTime(10_000);
  expect(notice().hidden).toBe(false);
  saved("unknown");
  expect(notice().textContent).toContain(
    "Couldn't confirm that the layout was saved.",
  );
  saved("saved");
  expect(notice().textContent).toContain("Layout saved.");
  vi.advanceTimersByTime(4000);
  expect(notice().hidden).toBe(true);
});
