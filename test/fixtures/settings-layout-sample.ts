import type { SettingsLayoutObservation } from "./settings-layout-observation";

// Synthetic geometry for the layout oracle's headless negative controls.
export const rect = (
  left: number,
  top: number,
  width: number,
  height: number,
) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

export function sample(
  contentWidth = 400,
  form = "stacked",
  shortcut = "wrapped",
  selected = "settings-panel-general",
): SettingsLayoutObservation {
  const ids = [
    "settings-panel-general",
    "settings-panel-appearance",
    "settings-panel-terminal",
    "settings-panel-window",
    "settings-panel-shortcuts",
    "settings-panel-config-file",
    "settings-panel-extensions",
  ];
  return {
    panels: ids.map((id) => ({
      id,
      hidden: id !== selected,
      display: id === selected ? "flex" : "none",
      box: rect(
        0,
        0,
        id === selected ? Math.min(contentWidth, 1120) : 0,
        id === selected ? 160 : 0,
      ),
    })),
    categories: ids.map((panel) => ({ panel, selected: panel === selected })),
    contentWidth,
    navigation: { mode: "grid", reachable: true },
    theme:
      selected === "settings-panel-appearance"
        ? {
            grid: rect(0, 0, Math.min(contentWidth, 1120), 40),
            cards: Array.from({ length: 6 }, (_, index) =>
              rect(
                (Math.min(contentWidth, 1120) / 6) * index,
                0,
                Math.min(contentWidth, 1120) / 6,
                40,
              ),
            ),
          }
        : null,
    extensions:
      selected === "settings-panel-extensions"
        ? {
            catalog: rect(0, 0, Math.min(contentWidth, 1120), 160),
            cards: [rect(0, 0, Math.min(contentWidth, 1120), 40)],
            installed: rect(0, 0, Math.min(contentWidth, 1120), 160),
            installedRows: [rect(0, 0, Math.min(contentWidth, 1120), 40)],
          }
        : null,
    forms: [
      {
        display: form === "stacked" ? "flex" : "grid",
        direction: "column",
        box: rect(0, 0, Math.min(contentWidth, 720), 60),
        label: rect(0, 0, 120, 20),
        field:
          form === "stacked" ? rect(0, 28, 112, 32) : rect(200, 0, 112, 32),
      },
    ],
    labels: [
      { box: rect(0, 0, 120, 20), naturalWidth: 100, lineHeight: 20, lines: 1 },
    ],
    shortcuts:
      selected === "settings-panel-shortcuts"
        ? [0, 100].map((top) => ({
            columns: shortcut === "wrapped" ? 2 : 3,
            name: rect(0, top + 8, 120, 20),
            binding: rect(136, top + 8, 120, 36),
            actions:
              shortcut === "wrapped"
                ? rect(0, top + 52, 238, 32)
                : rect(500, top + 8, 238, 32),
          }))
        : [],
    overflow: false,
    focus: true,
    scheme: "dark",
    width: 320,
    height: 200,
  };
}
