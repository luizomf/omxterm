// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createRendererLanguage } from "../../src/renderer/renderer-language";
import { createStateMarks } from "../../src/renderer/state-marks";
import { leaf } from "../../src/renderer/pane-layout";
import type {
  TerminalPane,
  TerminalTab,
} from "../../src/renderer/terminal-panes";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function tabWithPanes(count: number) {
  const tab = { kind: "terminal", removed: false } as unknown as TerminalTab;
  const panes = Array.from({ length: count }, () => {
    const container = document.createElement("main");
    document.body.append(container);
    return { tab, container } as unknown as TerminalPane;
  });
  tab.layout =
    count === 1
      ? leaf(panes[0]!)
      : {
          kind: "split",
          direction: "row",
          children: panes.map((pane) => leaf(pane)),
          weights: panes.map(() => 1 / count),
        };
  tab.focused = panes[0]!;
  return { tab, panes };
}
const labels = (elements: readonly Element[]) =>
  elements.map((element) => element.getAttribute("aria-label"));
const paneLabels = (pane: TerminalPane) =>
  labels([...pane.container.querySelectorAll("[role=img]")]);

it("shows each owner's mark on its pane and once per owner on the tab", () => {
  const changed = vi.fn();
  const marks = createStateMarks(document, createRendererLanguage(), changed);
  const { tab, panes } = tabWithPanes(2);
  marks.set(panes[0]!, "mirror", { glyph: "mirror", label: "Source" });
  marks.set(panes[1]!, "mirror", { glyph: "mirror", label: "Member" });
  marks.set(panes[1]!, "other", { glyph: "mirror", label: "Other" });
  expect(paneLabels(panes[0]!)).toEqual(["Source"]);
  expect(paneLabels(panes[1]!)).toEqual(["Member", "Other"]);
  expect(panes[1]!.container.querySelector("[title=Other]")).not.toBeNull();
  expect(labels(marks.tab(tab))).toEqual(["Source", "Other"]);
  expect(changed).toHaveBeenCalledTimes(3);

  marks.set(panes[1]!, "mirror", undefined);
  expect(paneLabels(panes[1]!)).toEqual(["Other"]);
  marks.set(panes[1]!, "other", undefined);
  expect(paneLabels(panes[1]!)).toEqual([]);
  expect(labels(marks.tab(tab))).toEqual(["Source"]);

  marks.dispose();
  expect(paneLabels(panes[0]!)).toEqual([]);
});

it("keeps only the latest notice; surprises time out and notices wait for the user", () => {
  vi.useFakeTimers();
  const marks = createStateMarks(document, createRendererLanguage(), vi.fn());
  const visible = () =>
    document.querySelector(".state-notice:not([hidden])")?.textContent ?? "";
  marks.flash("Gone soon.");
  expect(visible()).toContain("Gone soon.");
  vi.advanceTimersByTime(4000);
  expect(visible()).toBe("");
  marks.flash("First.");
  marks.notify("Needs you.");
  vi.advanceTimersByTime(60000);
  expect(visible()).toContain("Needs you.");
  expect(visible()).not.toContain("First.");
  document.querySelector<HTMLButtonElement>(".state-notice button")!.click();
  expect(visible()).toBe("");
  marks.dispose();
  expect(document.querySelector(".state-notice")).toBeNull();
});
