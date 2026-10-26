import assert from "node:assert/strict";
import type { SupportedLanguage } from "../../src/shared/i18n";

export interface SettingsGeometrySize {
  readonly width: number;
  readonly height: number;
}
export interface SettingsCompactGeometry {
  readonly kind: "native-minimum-request";
  readonly language: SupportedLanguage;
  readonly light: boolean;
  readonly requestedMinimum: SettingsGeometrySize;
  readonly outer: SettingsGeometrySize;
  readonly content: SettingsGeometrySize;
  readonly viewport: SettingsGeometrySize;
}

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}
interface Form {
  readonly display: string;
  readonly direction: string;
  readonly label: Box;
  readonly field: Box;
}
interface Label {
  readonly box: Box;
  readonly naturalWidth: number;
  readonly lineHeight: number;
  readonly lines: number;
}
interface Shortcut {
  readonly columns: number;
  readonly name: Box;
  readonly binding: Box;
  readonly actions: Box;
}
export interface SettingsLayoutObservation {
  readonly panels: readonly {
    readonly id: string;
    readonly hidden: boolean;
    readonly display: string;
    readonly box: Box;
  }[];
  readonly categories: readonly {
    readonly panel: string | null;
    readonly selected: boolean;
  }[];
  readonly contentWidth: number;
  readonly forms: readonly Form[];
  readonly labels: readonly Label[];
  readonly shortcuts: readonly Shortcut[];
  readonly overflow: boolean;
  readonly focus: boolean;
  readonly scheme: string;
  readonly width: number;
  readonly height: number;
}

// Serialized into the real renderer by the fixture. Keep this function closed
// over browser APIs only. Diagnostics contain bounded app identities/geometry,
// never field values, configuration bytes or arbitrary DOM text.
export function observeSettingsLayout(
  focusTarget = true,
): SettingsLayoutObservation {
  const root = document.querySelector<HTMLElement>(".settings-dialog")!;
  const panel = root.querySelector<HTMLElement>(
    ".settings-panel:not([hidden])",
  )!;
  const scroll = root.querySelector<HTMLElement>(".settings-panels")!;
  const box = (element: Element): Box => {
    const r = element.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  };
  const target = [
    ...panel.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input, select, textarea",
    ),
  ].at(-1);
  (
    window as Window & { settingsLayoutTarget?: HTMLElement | undefined }
  ).settingsLayoutTarget = target;
  if (focusTarget && target) {
    target.scrollIntoView({ block: "nearest" });
    target.focus();
  }
  const bounds = box(scroll);
  const r = target ? box(target) : undefined;
  const style = getComputedStyle(scroll);
  const measure = document.createElement("canvas").getContext("2d")!;
  return {
    panels: [...root.querySelectorAll<HTMLElement>(".settings-panel")]
      .slice(0, 7)
      .map((p) => ({
        id: p.id,
        hidden: p.hasAttribute("hidden"),
        display: getComputedStyle(p).display,
        box: box(p),
      })),
    categories: [
      ...root.querySelectorAll<HTMLElement>(".settings-tabs [role=tab]"),
    ]
      .slice(0, 7)
      .map((tab) => ({
        panel: tab.getAttribute("aria-controls"),
        selected: tab.getAttribute("aria-selected") === "true",
      })),
    contentWidth:
      scroll.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight),
    forms: [
      ...panel.querySelectorAll<HTMLElement>(
        ".settings-row:not(.settings-toggle)",
      ),
    ]
      .slice(0, 16)
      .map((row) => ({
        display: getComputedStyle(row).display,
        direction: getComputedStyle(row).flexDirection,
        label: box(row.querySelector("span")!),
        field: box(row.querySelector("input, select")!),
      })),
    labels: [
      ...panel.querySelectorAll<HTMLElement>(
        ".settings-row > span, .settings-shortcut-name",
      ),
    ]
      .slice(0, 16)
      .map((label) => {
        const font = getComputedStyle(label);
        measure.font = font.font;
        const range = document.createRange();
        range.selectNodeContents(label);
        return {
          box: box(label),
          naturalWidth: measure.measureText(label.textContent ?? "").width,
          lineHeight: parseFloat(font.lineHeight),
          lines: [...range.getClientRects()].filter(
            (rect) => rect.width > 0 && rect.height > 0,
          ).length,
        };
      }),
    shortcuts: [...panel.querySelectorAll<HTMLElement>(".settings-shortcut")]
      .slice(0, 2)
      .map((row) => ({
        columns: getComputedStyle(row).gridTemplateColumns.split(/\s+/u).length,
        name: box(row.querySelector(".settings-shortcut-name")!),
        binding: box(row.querySelector(".settings-shortcut-binding")!),
        actions: box(row.querySelector(".settings-shortcut-actions")!),
      })),
    overflow:
      document.documentElement.scrollWidth > innerWidth ||
      root.scrollWidth > root.clientWidth ||
      scroll.scrollWidth > scroll.clientWidth,
    focus:
      !target ||
      (!!r &&
        document.activeElement === target &&
        r.width > 0 &&
        r.height > 0 &&
        r.top >= Math.max(0, bounds.top) - 1 &&
        r.bottom <= Math.min(innerHeight, bounds.bottom) + 1),
    scheme: getComputedStyle(root).colorScheme,
    width: innerWidth,
    height: innerHeight,
  };
}

export function assertSettingsLayout(
  observation: SettingsLayoutObservation,
  expectedPanel: string,
) {
  const { panels, categories, contentWidth } = observation;
  assert.equal(panels.length, 6, "Settings panel inventory changed");
  assert.equal(categories.length, 6, "Settings category inventory changed");
  assert.deepEqual(
    categories
      .filter((category) => category.selected)
      .map((category) => category.panel),
    [expectedPanel],
    "Settings selected category does not match click",
  );
  assert.deepEqual(
    panels.filter((panel) => panel.display !== "none").map((panel) => panel.id),
    [expectedPanel],
    "Settings rendered panel does not match click",
  );
  for (const panel of panels) {
    assert.equal(
      panel.hidden,
      panel.id !== expectedPanel,
      "Settings hidden state does not match click",
    );
    assert.equal(
      panel.display === "none",
      panel.hidden,
      "Settings rendered and hidden state disagree",
    );
    if (!panel.hidden)
      assert.ok(
        panel.box.width > 0 && panel.box.height > 0,
        "Settings rendered panel has no geometry",
      );
  }
  assert.equal(observation.overflow, false, "Settings horizontal overflow");
  assert.ok(contentWidth > 0, "Settings content has no width");
  if (
    [
      "settings-panel-general",
      "settings-panel-appearance",
      "settings-panel-terminal",
    ].includes(expectedPanel)
  )
    assert.ok(observation.forms.length > 0, "Settings form geometry missing");
  for (const row of observation.forms) {
    assert.ok(
      row.field.width > 0 && row.field.height > 0,
      "Settings field has no geometry",
    );
    assert.equal(
      row.display,
      contentWidth < 560 ? "flex" : "grid",
      "Settings form did not follow content breakpoint",
    );
    if (contentWidth < 560) {
      assert.equal(row.direction, "column", "Settings form is not stacked");
      assert.ok(
        row.field.top >= row.label.bottom,
        "Settings field overlaps stacked label",
      );
    } else {
      assert.ok(
        row.field.left >= row.label.right &&
          row.field.top < row.label.bottom &&
          row.field.bottom > row.label.top,
        "Settings form columns do not align",
      );
    }
  }
  for (const label of observation.labels) {
    assert.ok(
      label.naturalWidth > 0 &&
        label.box.height > 0 &&
        label.lineHeight > 0 &&
        label.lines > 0,
      "Settings label has no rendered text geometry",
    );
    assert.ok(
      label.box.width + 1 >= Math.min(112, label.naturalWidth),
      "Settings label collapsed below readable width",
    );
    assert.ok(
      label.lines <= Math.ceil(label.naturalWidth / 112) + 1,
      "Settings label wraps into excessive lines",
    );
  }
  if (expectedPanel === "settings-panel-shortcuts")
    assert.equal(
      observation.shortcuts.length,
      2,
      "Settings shortcut geometry missing",
    );
  for (const row of observation.shortcuts) {
    assert.ok(
      row.actions.width > 0 && row.actions.height > 0,
      "Settings shortcut actions have no geometry",
    );
    assert.equal(
      row.columns,
      contentWidth < 760 ? 2 : 3,
      "Settings shortcuts did not follow content breakpoint",
    );
    if (contentWidth < 760)
      assert.ok(
        row.actions.top >= Math.max(row.name.bottom, row.binding.bottom) &&
          Math.abs(row.actions.left - row.name.left) <= 1,
        "Settings shortcut actions do not occupy their own line",
      );
    else
      assert.ok(
        row.actions.left >= row.binding.right &&
          row.actions.top < row.binding.bottom &&
          row.actions.bottom > row.binding.top,
        "Settings shortcut actions are not in the third column",
      );
  }
}
