// Ghostty's optional Style.bg is exported as alpha 0 for implicit defaults and
// alpha 255 for explicit cell backgrounds, independently of RGB. OMXTerm paints
// the default tint once in the host; ordinary foreground alpha is unchanged.
export const backgroundCorrections = [
  {
    original:
      '  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false });',
    corrected:
      '  const gl = canvas.getContext("webgl2", { antialias: false, alpha: true, depth: false });',
  },
  {
    original:
      "  gl.clearColor(defaultBg[0], defaultBg[1], defaultBg[2], defaultBg[3]);",
    corrected: "  gl.clearColor(0, 0, 0, 0);",
  },
  {
    original: `        fg = bg;
        bg = tmp;`,
    corrected: `        // Default-background alpha describes paint ownership, not inverse ink.
        fg = [bg[0], bg[1], bg[2], 1];
        bg = tmp;`,
    occurrences: 2,
  },
  {
    original: `      const bgForText = bg[3] < 1 ? [
        bg[0] + defaultBg[0] * (1 - bg[3]),
        bg[1] + defaultBg[1] * (1 - bg[3]),
        bg[2] + defaultBg[2] * (1 - bg[3]),
        1
      ] : bg;`,
    corrected: `      // Keep RGB for glyph contrast correction without painting default cells.
      const bgForText = bg[3] === 0 ? [bg[0], bg[1], bg[2], 1] : bg;`,
    occurrences: 2,
  },
];
