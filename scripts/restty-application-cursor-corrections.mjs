// Read DECCKM from the parser's authoritative core state at key encoding time.
// Kitty and modified keys keep their existing encoding; only legacy bare arrows
// select SS3 in application mode. No output-side mode mirror is maintained.
export const applicationCursorCorrections = [
  {
    original: "function encodeDefaultKeyEvent(event) {",
    corrected:
      "function encodeDefaultKeyEvent(event, applicationCursorKeys = false) {",
  },
  {
    original:
      "return event.shiftKey || event.altKey || event.ctrlKey ? `\\x1B[1;${modifierCode(event)}${modifierFinal}` : `\\x1B[${modifierFinal}`;",
    corrected:
      'return event.shiftKey || event.altKey || event.ctrlKey ? `\\x1B[1;${modifierCode(event)}${modifierFinal}` : applicationCursorKeys && key.startsWith("Arrow") ? `\\x1BO${modifierFinal}` : `\\x1B[${modifierFinal}`;',
  },
  {
    original:
      "function encodeKeyEvent(event, config = DEFAULT_CONFIG, kittyFlags = 0) {",
    corrected:
      "function encodeKeyEvent(event, config = DEFAULT_CONFIG, kittyFlags = 0, applicationCursorKeys = false) {",
  },
  {
    original: "seq = encodeDefaultKeyEvent(event);",
    corrected: "seq = encodeDefaultKeyEvent(event, applicationCursorKeys);",
  },
  {
    original:
      "encodeKeyEvent: (event) => encodeKeyEvent(event, config, options.getKittyKeyboardFlags?.() ?? 0),",
    corrected:
      "encodeKeyEvent: (event) => encodeKeyEvent(event, config, options.getKittyKeyboardFlags?.() ?? 0, options.getApplicationCursorKeys?.() ?? false),",
  },
  {
    original: `      return wasm.getKittyKeyboardFlags(wasmHandle);
    },`,
    corrected: `      return wasm.getKittyKeyboardFlags(wasmHandle);
    },
    getApplicationCursorKeys: () => {
      if (!wasm || !wasmHandle)
        return false;
      return wasm.getApplicationCursorKeys(wasmHandle);
    },`,
  },
];

export const applicationCursorDeclarations = [
  {
    path: "wasm/runtime/restty-wasm.d.ts",
    originalDigest:
      "7d64384f02cae8fe7c72b7a83562d96d5ea5f1c33eb4a7be00c9a684501e8aaa",
    correctedDigest:
      "3287471b2567c62b7d7192d9836679e55d12466ea4ed9923b8690e789ae0ed5f",
    original: "    getKittyKeyboardFlags(handle: number): number;",
    corrected:
      "    getKittyKeyboardFlags(handle: number): number;\n    /** Read the parser-owned DECCKM application cursor mode. */\n    getApplicationCursorKeys(handle: number): boolean;",
  },
  {
    path: "wasm/runtime/types.d.ts",
    originalDigest:
      "292911b6f8f7d941415c34b2dd66d058d5aa6a71d10854af808ad80fe4023459",
    correctedDigest:
      "0cd3d4d34ccc3743e1ef2a5f50599859f451ec166417a96d01f58499aea0d270",
    original: "    restty_kitty_keyboard_flags?: (handle: number) => number;",
    corrected:
      "    restty_kitty_keyboard_flags?: (handle: number) => number;\n    restty_application_cursor_keys: (handle: number) => number;",
  },
  {
    path: "input/types.d.ts",
    originalDigest:
      "73db27112f1d59e42be7e33350f7dd12a43565b400fd84a2ffb73ab7414b3f84",
    correctedDigest:
      "f2d0f52a66fce941657a5b26242aabe01fd7ef21b3099f38eb095cbbd406877e",
    original: "    getKittyKeyboardFlags?: () => number;",
    corrected:
      "    getKittyKeyboardFlags?: () => number;\n    /** Read application cursor mode from the live core, not a JS mode mirror. */\n    getApplicationCursorKeys?: () => boolean;",
  },
  {
    path: "input/keymap.d.ts",
    originalDigest:
      "c8ac93e19455cbd811ff6c3d21c54c00ffffb6de18e0a3d46e5d0db938f1db62",
    correctedDigest:
      "fc4e0b866e6f7ba132c730ab1910958c58338f86c7a03c5d6a390dd34b577d73",
    original: "config?: InputHandlerConfig, kittyFlags?: number): string;",
    corrected:
      "config?: InputHandlerConfig, kittyFlags?: number, applicationCursorKeys?: boolean): string;",
  },
  {
    path: "input/keymap/default-mapping.d.ts",
    originalDigest:
      "e741d9a15613512aa6aeb17f38c0b25f2d71a2f05c052557735df62e94e14bc1",
    correctedDigest:
      "763c2c0cc93c3124099c100895675b2023db09e55c65a8fd4d873efdc68d56b0",
    original: "encodeDefaultKeyEvent(event: KeyboardEvent): string;",
    corrected:
      "encodeDefaultKeyEvent(event: KeyboardEvent, applicationCursorKeys?: boolean): string;",
  },
];

export const applicationCursorCoreCorrections = [
  {
    original: '  "restty_event_consume",',
    corrected: '  "restty_event_consume",\n  "restty_application_cursor_keys",',
  },
  {
    original: "  getKittyKeyboardFlags(handle) {",
    corrected: `  getApplicationCursorKeys(handle) {
    return this.exports.restty_application_cursor_keys(handle) !== 0;
  }
  getKittyKeyboardFlags(handle) {`,
  },
];
