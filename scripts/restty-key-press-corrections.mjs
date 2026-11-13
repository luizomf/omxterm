// An agent's press (ADR 0052) is encoded by the same keymap as the user's key,
// from a plain key description instead of a DOM event, against the pane's live
// application-cursor and Kitty keyboard modes. The bytes are what the Surface
// would send: keydown, plus keyup only when Kitty asks for release events,
// each through the PTY mapping. Nothing is written here; main writes them.
export const keyPressCorrections = [
  {
    original:
      "    encodeKeyEvent: (event) => encodeKeyEvent(event, config, options.getKittyKeyboardFlags?.() ?? 0, options.getApplicationCursorKeys?.() ?? false),",
    corrected: `    encodeKeyEvent: (event) => encodeKeyEvent(event, config, options.getKittyKeyboardFlags?.() ?? 0, options.getApplicationCursorKeys?.() ?? false),
    encodeKeyPress: (key) => {
      const kittyFlags = options.getKittyKeyboardFlags?.() ?? 0;
      const applicationCursorKeys = options.getApplicationCursorKeys?.() ?? false;
      const encode = (type) => mapKeyForPty(encodeKeyEvent({ ...key, type, metaKey: false, repeat: false, isComposing: false }, config, kittyFlags, applicationCursorKeys));
      return encode("keydown") + ((kittyFlags & KITTY_FLAG_REPORT_EVENTS) !== 0 ? encode("keyup") : "");
    },`,
  },
  {
    original:
      "    isBracketedPasteEnabled: () => inputHandler.isBracketedPaste(),",
    corrected: `    isBracketedPasteEnabled: () => inputHandler.isBracketedPaste(),
    encodeKeyPress: (key) => inputHandler.encodeKeyPress(key),`,
  },
];
