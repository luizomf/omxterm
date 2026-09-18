import type { TerminalFontData } from "../shared/terminal-font-data";
import {
  terminalFontInputs,
  type TerminalFontInput,
} from "../terminal-surface/terminal-font-stack";

export interface TerminalFontGenerationLease {
  readonly fonts: readonly TerminalFontInput[];
  release(): void;
}

export interface TerminalFontGenerationOwner {
  acquire(
    family: string | undefined,
    abortSignal?: AbortSignal,
  ): Promise<TerminalFontGenerationLease>;
  select(family: string | undefined): void;
  dispose(): void;
}

interface FontGeneration {
  readonly family: string | undefined;
  retired: boolean;
  references: number;
  attempt: Promise<readonly TerminalFontInput[]> | undefined;
  fonts: readonly TerminalFontInput[] | undefined;
}

/**
 * Owns one isolated native-font snapshot for the active configuration
 * generation in a Terminal Window. Surface leases borrow those exact backing
 * identities; superseded generations stay alive only for their existing
 * creation-time consumers.
 */
export function createTerminalFontGenerationOwner(
  loadFontData: (family?: string) => Promise<TerminalFontData>,
  initialFamily?: string,
): TerminalFontGenerationOwner {
  let disposed = false;
  const disposal = new AbortController();
  let current = createGeneration(initialFamily);

  const discardIfUnused = (generation: FontGeneration) => {
    if (generation.references !== 0) return;
    generation.fonts = undefined;
    generation.attempt = undefined;
  };

  const releaseReference = (generation: FontGeneration) => {
    if (generation.references === 0) return;
    generation.references -= 1;
    if (generation.references === 0) discardIfUnused(generation);
  };

  const load = (generation: FontGeneration) => {
    if (generation.fonts) return Promise.resolve(generation.fonts);
    if (generation.attempt) return generation.attempt;
    let published: Promise<readonly TerminalFontInput[]>;
    const attempt = loadFontData(generation.family).then((fontData) => {
      if (fontData.configured?.family !== generation.family)
        throw new Error(
          "Configured Terminal Font data did not match the requested family",
        );
      // terminalFontInputs makes exact-range snapshots of every native view.
      // Running it once here isolates IPC/caller bytes before publication.
      const fonts = Object.freeze(terminalFontInputs(fontData));
      if (generation.attempt === published) {
        generation.attempt = undefined;
        if (!disposed && (!generation.retired || generation.references > 0))
          generation.fonts = fonts;
      }
      return fonts;
    });
    published = attempt.catch((error: unknown) => {
      if (generation.attempt === published) generation.attempt = undefined;
      throw error;
    });
    generation.attempt = published;
    return published;
  };

  const acquire = async (
    family: string | undefined,
    abortSignal?: AbortSignal,
  ): Promise<TerminalFontGenerationLease> => {
    if (disposed) throw new Error("Terminal Font generation owner is disposed");
    if (family !== current.family)
      throw new Error(
        "Terminal Font generation does not match the active configuration",
      );
    if (abortSignal?.aborted)
      throw new Error("Terminal Font generation acquisition was cancelled");

    const generation = current;
    generation.references += 1;
    let referenceReleased = false;
    const release = () => {
      if (referenceReleased) return;
      referenceReleased = true;
      releaseReference(generation);
    };

    try {
      const fonts = await Promise.race([
        load(generation),
        cancellation(abortSignal),
        cancellation(disposal.signal),
      ]);
      if (disposed || abortSignal?.aborted) {
        release();
        throw new Error("Terminal Font generation acquisition was cancelled");
      }
      return { fonts, release };
    } catch (error) {
      release();
      throw error;
    }
  };

  return {
    acquire,
    select(family) {
      if (disposed) return;
      if (family === current.family) return;
      const previous = current;
      previous.retired = true;
      discardIfUnused(previous);
      current = createGeneration(family);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposal.abort();
      current.retired = true;
      current.fonts = undefined;
      current.attempt = undefined;
    },
  };
}

function createGeneration(family: string | undefined): FontGeneration {
  return {
    family,
    retired: false,
    references: 0,
    attempt: undefined,
    fonts: undefined,
  };
}

function cancellation(signal: AbortSignal | undefined): Promise<never> {
  if (!signal) return new Promise<never>(() => undefined);
  return new Promise<never>((_resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Terminal Font generation acquisition was cancelled"));
      return;
    }
    signal.addEventListener(
      "abort",
      () =>
        reject(new Error("Terminal Font generation acquisition was cancelled")),
      { once: true },
    );
  });
}
