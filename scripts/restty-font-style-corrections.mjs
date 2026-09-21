// Exact face indices are validated by Electron main. Keep them independent of
// the source key so multiple styles in one TTC share its bytes and parse result.
export const fontStyleCorrections = [
  {
    original:
      "[(entry) => hasBoldHint(entry) && !hasItalicHint(entry), (entry) => hasBoldHint(entry)]",
    corrected: "[(entry) => hasBoldHint(entry) && !hasItalicHint(entry)]",
  },
  {
    original: `      (entry) => hasItalicHint(entry) && !hasBoldHint(entry),
      (entry) => hasItalicHint(entry)`,
    corrected: `      (entry) => hasItalicHint(entry) && !hasBoldHint(entry)`,
  },
  {
    original: `      return pickFirstMatch(predicate, allowSequenceShapingFallback);`,
    corrected: `      // A missing style may be synthesized from regular, never from a face
      // carrying an unrequested weight or slant (for example bold-italic).
      return pickFirstMatch((entry) => !hasBoldHint(entry) && !hasItalicHint(entry) && (!predicate || predicate(entry)), allowSequenceShapingFallback);`,
  },
  {
    original: `    kind: "buffer",
    data: input.data,
    label: name ?? \`font-buffer-\${index + 1}\`,`,
    corrected: `    kind: "buffer",
    data: input.data,
    faceIndex: input.faceIndex === undefined ? undefined : (() => {
      if (!Number.isInteger(input.faceIndex) || input.faceIndex < 0 || input.faceIndex > 65535)
        throw new Error("Invalid font face index");
      return input.faceIndex;
    })(),
    label: name ?? \`font-buffer-\${index + 1}\`,`,
  },
  {
    original: `      const collectionFaces = parsedFaces.filter((face) => face.family !== undefined);`,
    corrected: `      if (source.kind === "buffer" && source.faceIndex !== undefined) {
        parsedFaces = parsedFaces.filter((face) => (face.index ?? 0) === source.faceIndex);
        if (parsedFaces.length !== 1)
          throw new Error("required font face missing");
      } else {
      const collectionFaces = parsedFaces.filter((face) => face.family !== undefined);`,
  },
  {
    original: `        parsedFaces = regularFaces.length ? regularFaces : familyFaces;
      }
      sourceEntry.lastUsedAt = now();`,
    corrected: `        parsedFaces = regularFaces.length ? regularFaces : familyFaces;
      }
      }
      sourceEntry.lastUsedAt = now();`,
  },
];
