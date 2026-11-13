// Restty swallows OSC 9 progress reports (ConEmu's `9;4`) and parses OSC 9 and
// OSC 777 notifications itself. OMXTerm needs both, told apart by one parser
// it owns, so the host route that already receives OSC 52 now also receives
// the raw payload of OSC 9 and OSC 777 (everything after `9;` or `777;`).
// Without a host route, Restty's own behavior is unchanged.
export const attentionOscCorrections = [
  {
    original: `  if (code === "9") {
    const firstSep = content.indexOf(";");
    const body = firstSep >= 0 ? content.slice(firstSep + 1) : "";`,
    corrected: `  if (code === "9") {
    const firstSep = content.indexOf(";");
    const body = firstSep >= 0 ? content.slice(firstSep + 1) : "";
    if (handlers.onOsc) {
      handlers.onOsc(9, body);
      return true;
    }`,
  },
  {
    original: `  if (code === "777") {
    const firstSep = content.indexOf(";");
    const rest = firstSep >= 0 ? content.slice(firstSep + 1) : "";`,
    corrected: `  if (code === "777") {
    const firstSep = content.indexOf(";");
    const rest = firstSep >= 0 ? content.slice(firstSep + 1) : "";
    if (handlers.onOsc) {
      handlers.onOsc(777, rest);
      return true;
    }`,
  },
];
