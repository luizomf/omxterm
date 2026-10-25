// 24-unit stroke icons drawn for OMXTerm; one path string per stroke. They
// are built as DOM nodes, so no markup is parsed.
export const ICONS = {
  sessions: [
    "M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z",
    "M4 15a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z",
    "M8 7h.01",
    "M8 17h.01",
  ],
  commands: ["M5 17l5-5-5-5", "M12 18h7"],
  files: [
    "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  ],
  assistant: [
    "M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z",
    "M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
  ],
  find: ["M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z", "M20 20l-4-4"],
  splitRight: ["M4 5h16v14H4z", "M12 5v14"],
  splitDown: ["M4 5h16v14H4z", "M4 12h16"],
  broadcast: [
    "M12 12h.01",
    "M8.5 8.5a5 5 0 0 0 0 7",
    "M15.5 8.5a5 5 0 0 1 0 7",
    "M5.6 5.6a9 9 0 0 0 0 12.8",
    "M18.4 5.6a9 9 0 0 1 0 12.8",
  ],
  newTab: ["M12 5v14", "M5 12h14"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  openTabs: ["M6 9l6 6 6-6"],
  up: ["M12 19V5", "M5 12l7-7 7 7"],
  home: ["M3 11l9-7 9 7", "M5 10v10h14V10"],
  refresh: ["M20 11a8 8 0 1 0-2.3 5.7", "M20 4v7h-7"],
  follow: ["M12 12h.01", "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z"],
  hidden: [
    "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z",
    "M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z",
  ],
  newFolder: [
    "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    "M12 10v6",
    "M9 13h6",
  ],
  newFile: ["M6 3h8l4 4v14H6z", "M14 3v4h4", "M12 11v6", "M9 14h6"],
  file: ["M6 3h8l4 4v14H6z", "M14 3v4h4"],
  link: [
    "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1",
    "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  ],
  eye: [
    "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z",
    "M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z",
  ],
  eyeOff: [
    "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z",
    "M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z",
    "M4 4l16 16",
  ],
  send: ["M4 12l16-8-6 16-2-6z"],
  stop: ["M7 7h10v10H7z"],
} as const;

export type IconName = keyof typeof ICONS;

export function icon(document: Document, name: IconName): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("omx-icon");
  for (const data of ICONS[name]) {
    const pathElement = document.createElementNS(namespace, "path");
    pathElement.setAttribute("d", data);
    svg.append(pathElement);
  }
  return svg;
}
