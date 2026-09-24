export const spaceInputCorrections = [
  {
    original: `      if (!event.ctrlKey && !event.metaKey && event.key.length === 1 && !event.repeat && !(event.altKey && optionActsAsAlt())) {`,
    corrected: `      // Standalone Space must not depend on native text insertion: macOS can
      // omit it on successive taps. Composition and native Option text bypass
      // this path above; the ordinary key encoder still owns protocol reporting.
      if (!event.ctrlKey && !event.metaKey && event.key.length === 1 && event.key !== " " && !event.repeat && !(event.altKey && optionActsAsAlt())) {`,
  },
  {
    original: `    if (options.imeInput && imeActive && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1 && !event.repeat && !event.isComposing && !options.interaction.imeState.composing) {`,
    corrected: `    if (options.imeInput && imeActive && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1 && event.key !== " " && !event.repeat && !event.isComposing && !options.interaction.imeState.composing) {`,
  },
];
