interface Correction {
  readonly original: string;
  readonly corrected: string;
}
export const applicationCursorCorrections: readonly Correction[];
export const applicationCursorCoreCorrections: readonly Correction[];
export const applicationCursorDeclarations: readonly (Correction & {
  readonly path: string;
  readonly originalDigest: string;
  readonly correctedDigest: string;
})[];
