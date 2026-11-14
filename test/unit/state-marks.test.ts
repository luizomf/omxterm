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
  labels([...pane.container.querySelectorAll(".ui-mark")]);

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

  marks.set(panes[1]!, "mirror", undefined);
  expect(paneLabels(panes[1]!)).toEqual(["Other"]);
  marks.set(panes[1]!, "other", undefined);
  expect(paneLabels(panes[1]!)).toEqual([]);
  expect(labels(marks.tab(tab))).toEqual(["Source"]);

  marks.dispose();
  expect(paneLabels(panes[0]!)).toEqual([]);
});

it("draws every state as one decorative icon: an outline while ambient, solid when it needs the user", () => {
  const marks = createStateMarks(document, createRendererLanguage(), vi.fn());
  const { tab, panes } = tabWithPanes(1);
  const glyphs = ["mirror", "working", "attention", "agent"] as const;
  for (const glyph of glyphs)
    marks.set(panes[0]!, glyph, { glyph, label: glyph });
  const icons = (elements: readonly Element[]) =>
    elements.map((element) => {
      const drawn = element.querySelectorAll("svg");
      expect(drawn).toHaveLength(1);
      // The mark carries the name; the drawing is hidden from it.
      expect(drawn[0]!.getAttribute("aria-hidden")).toBe("true");
      expect(element.textContent).toBe("");
      return drawn[0]!.getAttribute("fill") === "none" ? "outline" : "solid";
    });
  const expected = ["outline", "outline", "solid", "solid"];
  expect(icons([...panes[0]!.container.querySelectorAll(".ui-mark")])).toEqual(
    expected,
  );
  expect(icons(marks.tab(tab))).toEqual(expected);
  expect(labels(marks.tab(tab))).toEqual([...glyphs]);
  marks.dispose();
});

it("turns a pane's mark into a button when its owner gives an action", () => {
  const marks = createStateMarks(document, createRendererLanguage(), vi.fn());
  const { tab, panes } = tabWithPanes(1);
  const run = vi.fn();
  marks.set(panes[0]!, "busy", {
    glyph: "mirror",
    label: "Busy.",
    action: { label: "Click to stop.", run },
  });
  const button = panes[0]!.container.querySelector("button")!;
  expect(button.getAttribute("aria-label")).toBe("Busy. Click to stop.");
  expect(button.dataset.tip).toBe("Busy. Click to stop.");
  button.click();
  expect(run).toHaveBeenCalledOnce();
  // A tab is already a button: its glyph only names the state.
  const [onTab] = marks.tab(tab);
  expect(onTab!.tagName).toBe("SPAN");
  expect(onTab!.getAttribute("aria-label")).toBe("Busy.");
  marks.dispose();
});

it("shows one sentence at a time; surprises time out and notices wait for the user", () => {
  vi.useFakeTimers();
  const marks = createStateMarks(document, createRendererLanguage(), vi.fn());
  const visible = () =>
    document.querySelector(".state-notice:not([hidden])")?.textContent ?? "";
  marks.flash("Gone soon.");
  expect(visible()).toContain("Gone soon.");
  vi.advanceTimersByTime(4000);
  expect(visible()).toBe("");
  marks.flash("First.");
  const clearOld = marks.notify("Old.");
  marks.notify("Needs you.");
  clearOld();
  // A surprise never hides a notice that is waiting for the user.
  marks.flash("Surprise.");
  vi.advanceTimersByTime(60000);
  expect(visible()).toContain("Needs you.");
  expect(visible()).not.toMatch(/First|Old|Surprise/);
  document.querySelector<HTMLButtonElement>(".state-notice button")!.click();
  expect(visible()).toBe("");
  marks.dispose();
  expect(document.querySelector(".state-notice")).toBeNull();
});

it("shows a window mark on every pane, later panes and every tab, and in the corner without either", () => {
  const changed = vi.fn();
  const { tab, panes } = tabWithPanes(2);
  const all = [...panes];
  const corner = document.createElement("div");
  document.body.append(corner);
  let cornerShown = false;
  const marks = createStateMarks(document, createRendererLanguage(), changed, {
    panes: () => all,
    corner,
    cornerShown: () => cornerShown,
  });
  const stop = vi.fn();
  marks.set(panes[0]!, "mirror", { glyph: "mirror", label: "Source" });
  marks.setWindow("agent", {
    glyph: "agent",
    label: "Agents can do anything you can in this window.",
    action: { label: "Click this mark to stop them.", run: stop },
  });
  const agent =
    "Agents can do anything you can in this window. Click this mark to stop them.";
  // The window's mark sits at the edge, after the pane's own.
  expect(paneLabels(panes[0]!)).toEqual(["Source", agent]);
  expect(paneLabels(panes[1]!)).toEqual([agent]);
  expect(labels(marks.tab(tab))).toEqual([
    "Source",
    "Agents can do anything you can in this window.",
  ]);
  // An Application Tab carries only the window's mark.
  expect(labels(marks.tab(undefined))).toEqual([
    "Agents can do anything you can in this window.",
  ]);

  const later = document.createElement("main");
  document.body.append(later);
  const pane = { tab, container: later } as unknown as TerminalPane;
  all.push(pane);
  marks.attach(pane);
  expect(paneLabels(pane)).toEqual([agent]);

  expect(corner.querySelector(".ui-mark")).toBeNull();
  cornerShown = true;
  marks.refreshCorner();
  corner.querySelector<HTMLButtonElement>("button.ui-mark")!.click();
  expect(stop).toHaveBeenCalledOnce();

  marks.setWindow("agent", undefined);
  expect(paneLabels(panes[0]!)).toEqual(["Source"]);
  expect(paneLabels(pane)).toEqual([]);
  expect(corner.querySelector(".ui-mark")).toBeNull();
  marks.dispose();
});

it("hides every pane mark but the agent's, keeps it clickable, and restores all of them", () => {
  const { tab, panes } = tabWithPanes(2);
  const all = [...panes];
  const corner = document.createElement("div");
  document.body.append(corner);
  let cornerShown = false;
  const marks = createStateMarks(document, createRendererLanguage(), vi.fn(), {
    panes: () => all,
    corner,
    cornerShown: () => cornerShown,
  });
  const stop = vi.fn();
  marks.set(panes[0]!, "mirror", { glyph: "mirror", label: "Source" });
  marks.set(panes[1]!, "working", { glyph: "working", label: "Working" });
  marks.setWindow("mirror-window", { glyph: "mirror", label: "Window" });

  marks.showCapsule(false);
  expect(paneLabels(panes[0]!)).toEqual([]);
  expect(panes[0]!.container.querySelector(".state-marks")).toBeNull();
  expect(paneLabels(panes[1]!)).toEqual([]);

  marks.setWindow("agent", {
    glyph: "agent",
    label: "Agent",
    action: { label: "Stop.", run: stop },
  });
  for (const pane of panes) expect(paneLabels(pane)).toEqual(["Agent Stop."]);
  panes[0]!.container
    .querySelector<HTMLButtonElement>("button.ui-mark")!
    .click();
  expect(stop).toHaveBeenCalledOnce();
  // Tabs keep every state.
  expect(labels(marks.tab(tab))).toEqual([
    "Source",
    "Working",
    "Window",
    "Agent",
  ]);

  // A pane opened while hidden gets the agent mark only.
  const later = document.createElement("main");
  document.body.append(later);
  const pane = { tab, container: later } as unknown as TerminalPane;
  all.push(pane);
  marks.attach(pane);
  expect(paneLabels(pane)).toEqual(["Agent Stop."]);

  // The corner shows the agent alone too.
  cornerShown = true;
  marks.refreshCorner();
  expect(labels([...corner.querySelectorAll(".ui-mark")])).toEqual([
    "Agent Stop.",
  ]);

  marks.toggleCapsule();
  expect(paneLabels(panes[0]!)).toEqual(["Source", "Window", "Agent Stop."]);
  expect(paneLabels(panes[1]!)).toEqual(["Working", "Window", "Agent Stop."]);
  expect(paneLabels(pane)).toEqual(["Window", "Agent Stop."]);

  marks.toggleCapsule();
  marks.setWindow("agent", undefined);
  expect(paneLabels(panes[0]!)).toEqual([]);
  expect(corner.querySelector(".ui-mark")).toBeNull();
  marks.dispose();
});
