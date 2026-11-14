/**
 * OMXTerm's one icon set: Lucide 1.73.0 geometry (ISC; Feather-derived icons
 * MIT, see assets/licenses/lucide-ISC.txt) drawn at stroke 1.75 on a 24 grid.
 * Vendored as path data: no dependency, icon font or network. Size, the tab
 * stroke and solid fills live in `.ui-icon` (src/renderer/ui.css); usage and
 * how to add an icon are in docs/ui-style-guide.md#icons.
 *
 * A string is a path's `d`; a tuple is any other element with its attributes.
 */
type Shape =
  string | readonly [tag: string, attributes: Record<string, string>];

const box = { width: "18", height: "18", x: "3", y: "3", rx: "2" };

const icons = {
  "arrow-down": ["M12 5v14", "m19 12-7 7-7-7"],
  "arrow-right": ["M5 12h14", "m12 5 7 7-7 7"],
  "arrow-up": ["m5 12 7-7 7 7", "M12 19V5"],
  check: ["M20 6 9 17l-5-5"],
  "chevron-down": ["m6 9 6 6 6-6"],
  "chevron-right": ["m9 18 6-6-6-6"],
  "circle-small": [["circle", { cx: "12", cy: "12", r: "6" }]],
  copy: [
    ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" }],
    "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
  ],
  diamond: [
    "M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z",
  ],
  ellipsis: [
    ["circle", { cx: "12", cy: "12", r: "1" }],
    ["circle", { cx: "19", cy: "12", r: "1" }],
    ["circle", { cx: "5", cy: "12", r: "1" }],
  ],
  file: [
    "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
    "M14 2v5a1 1 0 0 0 1 1h5",
  ],
  "folder-plus": [
    "M12 10v6",
    "M9 13h6",
    "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
  ],
  house: [
    "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
    "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  ],
  "loader-circle": ["M21 12a9 9 0 1 1-6.219-8.56"],
  minus: ["M5 12h14"],
  "move-horizontal": ["m18 8 4 4-4 4", "M2 12h20", "m6 8-4 4 4 4"],
  "panel-left": [["rect", box], "M9 3v18"],
  "panel-right": [["rect", box], "M15 3v18"],
  "refresh-cw": [
    "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
    "M21 3v5h-5",
    "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
    "M8 16H3v5",
  ],
  square: [["rect", box]],
  x: ["M18 6 6 18", "m6 6 12 12"],
} satisfies Record<string, readonly Shape[]>;

export type UiIconName = keyof typeof icons;

const SVG = "http://www.w3.org/2000/svg";

/**
 * A decorative 16 px line icon in the current text color. The element that
 * holds it carries the accessible name and tooltip. `solid` fills the shape:
 * only for marks that need the user (attention, agent).
 */
export function createIcon(
  document: Document,
  name: UiIconName,
  options: { readonly solid?: boolean } = {},
): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  const attributes: Record<string, string> = {
    class: "ui-icon",
    viewBox: "0 0 24 24",
    width: "16",
    height: "16",
    fill: options.solid ? "currentColor" : "none",
    stroke: "currentColor",
    "stroke-width": "1.75",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
    "data-icon": name,
  };
  for (const [key, value] of Object.entries(attributes))
    svg.setAttribute(key, value);
  const shapes: readonly Shape[] = icons[name];
  for (const shape of shapes) {
    const [tag, shapeAttributes] =
      typeof shape === "string" ? (["path", { d: shape }] as const) : shape;
    const element = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(shapeAttributes))
      element.setAttribute(key, value);
    svg.append(element);
  }
  return svg;
}

/**
 * Make `name` the only content of `host` (a button or mark). Calling it again
 * with the icon already shown changes nothing.
 */
export function setIcon(
  host: Element,
  name: UiIconName,
  options: { readonly solid?: boolean } = {},
): void {
  const current = host.firstElementChild;
  if (
    host.childNodes.length === 1 &&
    current?.getAttribute("data-icon") === name
  )
    return;
  host.replaceChildren(createIcon(host.ownerDocument, name, options));
}
