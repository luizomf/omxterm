// text-shaper 0.1.28, bundled in Restty, misreads CFF2 variable outlines, so
// faces such as Fedora's Noto Sans CJK VF collection draw as stroke fragments.
// The vstore offsets start after its length prefix, ItemVariationData carries
// a separate regionIndexCount, and blend must drop its deltas at default axes.
// A CFF2 face whose default master is lighter than Regular (Noto Sans CJK VF
// defaults to Thin) draws at wght 400, as fontconfig selects it.
export const cff2Corrections = [
  {
    original: `function hH(x) {
  let A = x.offset, Q = x.uint16(), K = x.uint16(), Z = x.uint32(), E = x.uint16(), $ = [];`,
    corrected: `function omxtermCff2RegularCoords(font) {
  if (font.omxtermRegularCoords !== undefined)
    return font.omxtermRegularCoords;
  let coords = (font.fvar?.axes ?? []).map((axis) => axis.tag === 2003265652 ? y4(axis, 400) : 0);
  if (font.avar)
    coords = h4(font.avar, coords);
  font.omxtermRegularCoords = coords.some((coord) => coord !== 0) ? coords : null;
  return font.omxtermRegularCoords;
}
function hH(x) {
  let Q = x.uint16(), A = x.offset, K = x.uint16(), Z = x.uint32(), E = x.uint16(), $ = [];`,
  },
  {
    original: `function dH(x) {
  let A = x.uint16(), Q = x.uint16(), K = Q & 32767, Z = (Q & 32768) !== 0, E = [];
  for (let J = 0;J < K; J++)
    E.push(x.uint16());
  let $ = [];
  for (let J = 0;J < A; J++) {
    let q = [];
    for (let U = 0;U < K; U++)
      if (Z)
        q.push(x.int32());
      else
        q.push(x.int16());
    $.push(q);
  }`,
    corrected: `function dH(x) {
  let A = x.uint16(), Q = x.uint16(), K = x.uint16(), W = Q & 32767, Z = (Q & 32768) !== 0, E = [];
  for (let J = 0;J < K; J++)
    E.push(x.uint16());
  let $ = [];
  for (let J = 0;J < A; J++) {
    let q = [];
    for (let U = 0;U < K; U++)
      if (U < W)
        q.push(Z ? x.int32() : x.int16());
      else
        q.push(Z ? x.int16() : x.int8());
    $.push(q);
  }`,
  },
  {
    original: `    case 16: {
      if (!x.axisCoords || !x.vstore)
        break;
      let E = Z.pop();
      if (E === undefined)
        break;
      let $ = x.vstore.itemVariationData[x.vsindex]?.regionIndexCount ?? 0, J = E * $, q = Z.splice(-J), U = Z.splice(-E);`,
    corrected: `    case 16: {
      let E = Z.pop();
      if (E === undefined)
        break;
      let $ = x.vstore?.itemVariationData[x.vsindex]?.regionIndexCount ?? 0, J = E * $, q = J > 0 ? Z.splice(-J) : [], U = E > 0 ? Z.splice(-E) : [];
      if (!x.axisCoords || !x.vstore) {
        Z.push(...U);
        break;
      }`,
  },
  {
    original: `    if (this.cff2)
      return k2(this.cff2, x, null);
    return null;`,
    corrected: `    if (this.cff2)
      return k2(this.cff2, x, omxtermCff2RegularCoords(this));
    return null;`,
  },
];
