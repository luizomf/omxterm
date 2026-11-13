// Restty's OutputFilter answers DA1, DA2, XTVERSION, window reports and color
// queries synchronously, while the Ghostty core answers what it parses (such
// as a Kitty `a=q`) only after the filtered text reaches it. A probe like
// `a=q` + DA1 then read DA1 first and stopped before the Kitty reply. Like the
// CPR correction, commit the filtered prefix to the core before any
// filter-owned reply, so replies keep stream order. One-argument callers keep
// the previous behavior.
export const replyOrderCorrections = [
  {
    original: `    const getReplyCursor = () => trackedCursor;
    let result = "";`,
    corrected: `    const getReplyCursor = () => trackedCursor;
    let result = "";
    const sendReply = onCoreOutput
      ? (data) => {
          if (result) {
            onCoreOutput(result);
            result = "";
          }
          this.sendReply(data);
        }
      : this.sendReply;`,
  },
  {
    original: `  handleOsc(seq) {
    return handleOscSequence(seq, {
      sendReply: this.sendReply,`,
    corrected: `  handleOsc(seq, sendReply = this.sendReply) {
    return handleOscSequence(seq, {
      sendReply,`,
  },
  {
    original: `  handleWindowOp(seq) {
    return handleWindowOpSequence(seq, {
      sendReply: this.sendReply,`,
    corrected: `  handleWindowOp(seq, sendReply = this.sendReply) {
    return handleWindowOpSequence(seq, {
      sendReply,`,
  },
  {
    original: "if (!this.handleOsc(seq)) {",
    corrected: "if (!this.handleOsc(seq, sendReply)) {",
  },
  {
    original: 'if (seq.endsWith("t") && this.handleWindowOp(seq)) {',
    corrected:
      'if (seq.endsWith("t") && this.handleWindowOp(seq, sendReply)) {',
  },
  {
    original: `      if (!handleCoreCsiSequence(seq, {
        sendReply: this.sendReply,`,
    corrected: `      if (!handleCoreCsiSequence(seq, {
        sendReply,`,
  },
];
