// Approximate an expanded monochrome contour with four bounded neighbours.
// Real bold and color glyphs keep their single draw. Reuse the existing atlas:
// this costs at most five placements, not additional font or glyph resources.
const original = `const boldOffset = syntheticBold && !colorGlyph ? Math.max(1, Math.round(gw * BOLD_OFFSET)) : 0;
const renderMode = colorGlyph ? GLYPH_RENDER_MODE_COLOR : GLYPH_RENDER_MODE_MONO;
const pushGlyph = (xPos) => {
  glyphData.push(xPos, py, gw, gh, u0, v0, u1, v1, item.fg[0], item.fg[1], item.fg[2], item.fg[3], bg[0], bg[1], bg[2], bg[3], slant, renderMode);
};
pushGlyph(px);
if (boldOffset > 0) {
  const minGlyphX = Math.round(item.x);
  const maxGlyphX = Math.round(item.x + maxWidth - gw);
  let bx = clamp(px + boldOffset, minGlyphX, maxGlyphX);
  if (bx === px)
    bx = clamp(px - boldOffset, minGlyphX, maxGlyphX);
  if (bx === px)
    pushGlyph(px);
  else
    pushGlyph(bx);
}`;

const corrected = `const boldOffset = syntheticBold && !colorGlyph ? Math.max(1, Math.round(cellW * BOLD_OFFSET)) : 0;
const renderMode = colorGlyph ? GLYPH_RENDER_MODE_COLOR : GLYPH_RENDER_MODE_MONO;
const pushGlyph = (xPos, yPos = py) => {
  glyphData.push(xPos, yPos, gw, gh, u0, v0, u1, v1, item.fg[0], item.fg[1], item.fg[2], item.fg[3], bg[0], bg[1], bg[2], bg[3], slant, renderMode);
};
pushGlyph(px);
if (boldOffset > 0) {
  // Expand both stroke directions without spilling into adjacent cells.
  // Skip collapsed offsets rather than repeatedly darkening the same mask.
  const left = Math.max(Math.round(item.x), px - boldOffset);
  const right = Math.min(Math.round(item.x + maxWidth - gw), px + boldOffset);
  const top = Math.max(Math.round(rowY), py - boldOffset);
  const bottom = Math.min(Math.round(rowY + cellH - gh), py + boldOffset);
  if (left < px) pushGlyph(left);
  if (right > px) pushGlyph(right);
  if (top < py) pushGlyph(px, top);
  if (bottom > py) pushGlyph(px, bottom);
}`;

const indent = (text, width) =>
  text
    .split("\n")
    .map((line) => " ".repeat(width) + line)
    .join("\n");

export const syntheticBoldCorrections = [
  {
    original: "const BOLD_OFFSET = 0.06;",
    corrected: "const BOLD_OFFSET = 0.04;",
  },
  ...[10, 8].map((width) => ({
    original: indent(original, width),
    corrected: indent(corrected, width),
  })),
];
