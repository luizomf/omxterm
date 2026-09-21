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
const pushGlyph = (xPos, yPos = py, width = gw, uvLeft = u0, uvRight = u1) => {
  glyphData.push(xPos, yPos, width, gh, uvLeft, v0, uvRight, v1, item.fg[0], item.fg[1], item.fg[2], item.fg[3], bg[0], bg[1], bg[2], bg[3], slant, renderMode);
};
pushGlyph(px);
if (boldOffset > 0) {
  // Expand both stroke directions without spilling into adjacent cells.
  // Skip collapsed offsets rather than repeatedly darkening the same mask.
  // The vertex shader shears synthetic italic toward the right. Validate the
  // complete transformed quad, including for vertical neighbours. Clip only
  // additional masks (with matching UVs), never the original italic overhang.
  const minX = Math.ceil(item.x - Math.min(0, slant));
  const maxX = Math.floor(item.x + maxWidth - Math.max(0, slant));
  const minY = Math.ceil(rowY);
  const maxY = Math.floor(rowY + cellH - gh);
  const pushInside = (xPos, yPos) => {
    if (yPos < minY || yPos > maxY) return;
    const left = Math.max(minX, xPos);
    const right = Math.min(maxX, xPos + gw);
    if (right <= left) return;
    const uvLeft = u0 + (left - xPos) / gw * (u1 - u0);
    const uvRight = u0 + (right - xPos) / gw * (u1 - u0);
    pushGlyph(left, yPos, right - left, uvLeft, uvRight);
  };
  pushInside(px - boldOffset, py);
  pushInside(px + boldOffset, py);
  const top = Math.max(minY, py - boldOffset);
  const bottom = Math.min(maxY, py + boldOffset);
  if (top < py) pushInside(px, top);
  if (bottom > py) pushInside(px, bottom);
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
