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
  readonly nestedColor: boolean;
  /** A ui-form-row; otherwise a labelled field with its name above it. */
  readonly formRow: boolean;
  /** One row holding several small fields. */
  readonly group: boolean;
  readonly box: Box;
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
  readonly box: Box;
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
  readonly navigation: { readonly mode: string; readonly reachable: boolean };
  readonly theme: {
    readonly grid: Box;
    readonly cards: readonly Box[];
  } | null;
  readonly extensions: {
    readonly catalog: Box;
    readonly cards: readonly Box[];
    readonly installed: Box;
    readonly installedRows: readonly Box[];
  } | null;
  readonly forms: readonly Form[];
  readonly labels: readonly Label[];
  readonly shortcuts: readonly Shortcut[];
  readonly shortcutIntro: Box | null;
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
  const nav = root.querySelector<HTMLElement>(".settings-tabs")!;
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
  const navReachable =
    !focusTarget ||
    [...nav.querySelectorAll<HTMLElement>("[role=tab]")].every((tab) => {
      tab.focus();
      const tabBox = box(tab);
      const navBox = box(nav);
      return (
        document.activeElement === tab &&
        tabBox.width > 0 &&
        tabBox.height > 0 &&
        tabBox.left >= navBox.left - 1 &&
        tabBox.right <= navBox.right + 1 &&
        tabBox.top >= Math.max(0, navBox.top) - 1 &&
        tabBox.bottom <= Math.min(innerHeight, navBox.bottom) + 1
      );
    });
  // The last control a person can see; collapsed or hidden-until-needed
  // controls (an on-demand link field, Cancel while idle) aren't on screen.
  const target = [
    ...panel.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input, select, textarea",
    ),
  ]
    .filter((control) => control.checkVisibility())
    .at(-1);
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
      .slice(0, 8) // Retain one overflow entry beyond the seven expected panels.
      .map((p) => ({
        id: p.id,
        hidden: p.hasAttribute("hidden"),
        display: getComputedStyle(p).display,
        box: box(p),
      })),
    categories: [
      ...root.querySelectorAll<HTMLElement>(".settings-tabs [role=tab]"),
    ]
      .slice(0, 8) // Extra categories must remain visible to the inventory oracle.
      .map((tab) => ({
        panel: tab.getAttribute("aria-controls"),
        selected: tab.getAttribute("aria-selected") === "true",
      })),
    contentWidth:
      scroll.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight),
    navigation: {
      mode: getComputedStyle(nav).flexDirection,
      reachable: navReachable,
    },
    theme:
      panel.id === "settings-panel-appearance"
        ? {
            grid: box(panel.querySelector(".settings-themes-grid")!),
            cards: [
              ...panel.querySelectorAll(
                ".settings-themes-grid .settings-theme-card",
              ),
            ].map(box),
          }
        : null,
    extensions:
      panel.id === "settings-panel-extensions"
        ? {
            catalog: box(panel.querySelector(".extension-catalog-list")!),
            cards: [...panel.querySelectorAll(".extension-catalog-card")].map(
              box,
            ),
            installed: box(panel.querySelector(".extension-installed-list")!),
            installedRows: [
              ...panel.querySelectorAll(".extension-installed-list > .ui-row"),
            ].map(box),
          }
        : null,
    forms: [...panel.querySelectorAll<HTMLElement>(".settings-row")]
      .filter((row) => !row.closest("[hidden]"))
      .slice(0, 16)
      .map((row) => {
        const formRow = row.classList.contains("ui-form-row");
        return {
          nestedColor: !!row.closest(".settings-theme-color-controls"),
          formRow,
          group: row.classList.contains("settings-group"),
          box: box(row),
          label: box(row.querySelector(".settings-control-caption, span")!),
          // A form row's control is its last child: a field, a slider with
          // its readout, or a group of fields.
          field: box(
            formRow
              ? row.lastElementChild!
              : row.querySelector("input, select")!,
          ),
        };
      }),
    labels: [
      ...panel.querySelectorAll<HTMLElement>(
        ".settings-control-caption, .settings-shortcut-name, .extensions-panel .settings-row > span",
      ),
    ]
      .filter((label) => !label.closest("[hidden]"))
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
        box: box(row),
        name: box(row.querySelector(".settings-shortcut-name")!),
        binding: box(row.querySelector(".settings-shortcut-binding")!),
        actions: box(row.querySelector(".settings-shortcut-actions")!),
      })),
    shortcutIntro:
      panel.id === "settings-panel-shortcuts"
        ? box(panel.querySelector(".settings-shortcuts > .settings-hint")!)
        : null,
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

function assertSettingsDetails(
  observation: SettingsLayoutObservation,
  expectedPanel: string,
) {
  assert.equal(
    observation.navigation.reachable,
    true,
    "Settings navigation tab is not scroll-reachable by focus",
  );
  assert.equal(
    observation.navigation.mode,
    observation.width < 640 ? "row" : "column",
    "Settings compact navigation did not follow its viewport breakpoint",
  );
  if (expectedPanel === "settings-panel-appearance") {
    const theme = observation.theme;
    assert.ok(
      theme && theme.cards.length >= 6,
      "Settings synthetic theme cards missing",
    );
    assert.ok(
      Math.abs(
        theme.grid.right -
          observation.panels.find((item) => item.id === expectedPanel)!.box
            .right,
      ) <= 2,
      "Settings theme grid misses the shared content edge",
    );
    const firstRow = theme.cards.filter(
      (card) => Math.abs(card.top - theme.cards[0]!.top) <= 1,
    );
    assert.ok(
      Math.abs(firstRow[0]!.left - theme.grid.left) <= 2 &&
        Math.abs(firstRow.at(-1)!.right - theme.grid.right) <= 2,
      "Settings theme card row misses the grid edges",
    );
  }
  if (expectedPanel === "settings-panel-extensions") {
    const extensions = observation.extensions;
    assert.ok(
      extensions && extensions.cards.length && extensions.installedRows.length,
      "Settings synthetic Extension cards missing",
    );
    const right = observation.panels.find((item) => item.id === expectedPanel)!
      .box.right;
    assert.ok(
      [
        extensions.catalog,
        ...extensions.cards,
        extensions.installed,
        ...extensions.installedRows,
      ].every((item) => Math.abs(item.right - right) <= 2),
      "Settings Extension cards miss the shared content edge",
    );
  }
}

function assertCommonFormBoundary(row: Form, panel: Box) {
  if (row.nestedColor) return;
  assert.ok(
    Math.abs(row.box.left - panel.left) <= 2 &&
      Math.abs(row.box.right - panel.right) <= 2,
    "Settings form row misses the common content boundary",
  );
}

function assertShortcutProportions(
  observation: SettingsLayoutObservation,
  expectedPanel: string,
) {
  if (expectedPanel !== "settings-panel-shortcuts") return;
  assert.equal(
    observation.shortcuts.length,
    2,
    "Settings shortcut geometry missing",
  );
  const panel = observation.panels.find((item) => item.id === expectedPanel)!;
  assert.ok(
    observation.shortcutIntro &&
      Math.abs(observation.shortcutIntro.right - panel.box.right) <= 2,
    "Settings shortcut introduction misses the common content boundary",
  );
  for (const row of observation.shortcuts)
    assert.ok(
      Math.abs(row.binding.right - row.box.right) <= 1 &&
        row.actions.right <= row.binding.left + 1,
      "Settings shortcut keys do not end the row after its actions",
    );
}

export function assertSettingsLayout(
  observation: SettingsLayoutObservation,
  expectedPanel: string,
) {
  const { panels, categories, contentWidth } = observation;
  assert.equal(panels.length, 7, "Settings panel inventory changed");
  assert.equal(categories.length, 7, "Settings category inventory changed");
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
    if (!panel.hidden) {
      assert.ok(
        panel.box.width > 0 && panel.box.height > 0,
        "Settings rendered panel has no geometry",
      );
      assert.ok(
        Math.abs(panel.box.width - Math.min(contentWidth, 720)) <= 2,
        "Settings categories do not share a content boundary",
      );
    }
  }
  assert.equal(observation.overflow, false, "Settings horizontal overflow");
  assert.ok(contentWidth > 0, "Settings content has no width");
  assertSettingsDetails(observation, expectedPanel);
  if (
    [
      "settings-panel-general",
      "settings-panel-appearance",
      "settings-panel-terminal",
    ].includes(expectedPanel)
  )
    assert.ok(observation.forms.length > 0, "Settings form geometry missing");
  for (const row of observation.forms) {
    assertCommonFormBoundary(
      row,
      panels.find((item) => item.id === expectedPanel)!.box,
    );
    assert.ok(
      row.field.width > 0 && row.field.height > 0,
      "Settings field has no geometry",
    );
    const beside =
      row.field.left >= row.label.right - 1 &&
      row.field.top < row.label.bottom &&
      row.field.bottom > row.label.top;
    const below = row.field.top >= row.label.bottom - 1;
    if (!row.formRow) {
      assert.ok(
        contentWidth < 560 ? below : beside,
        "Settings labelled field did not follow content breakpoint",
      );
      continue;
    }
    assert.ok(beside || below, "Settings control overlaps its name");
    // A single control always fits beside its name from 480 px of content,
    // and ends at the content edge; only a group of fields may wrap sooner.
    if (contentWidth >= 480 && !row.group)
      assert.ok(
        beside && Math.abs(row.field.right - row.box.right) <= 1,
        "Settings control does not end its row at the content edge",
      );
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
  assertShortcutProportions(observation, expectedPanel);
  for (const row of observation.shortcuts) {
    assert.ok(
      row.actions.width > 0 && row.actions.height > 0,
      "Settings shortcut actions have no geometry",
    );
    if (contentWidth >= 480)
      assert.ok(
        row.actions.left >= row.name.right - 1 &&
          row.binding.top < row.name.bottom &&
          row.binding.bottom > row.name.top,
        "Settings shortcut name, actions and keys do not share one line",
      );
  }
}
