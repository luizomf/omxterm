/**
 * Plays the user's notification sound file, whose bytes main read (ADR 0053).
 * Decoding through Web Audio keeps the page's media policy closed; a file
 * that does not decode is skipped silently.
 */
export function createAttentionSound(
  createContext: (() => AudioContext) | undefined = typeof AudioContext ===
  "function"
    ? () => new AudioContext()
    : undefined,
) {
  let context: AudioContext | undefined;
  let disposed = false;
  return {
    play(sound: Uint8Array) {
      if (disposed || !createContext) return;
      const audio = (context ??= createContext());
      // decodeAudioData takes ownership of its buffer; give it a copy.
      const bytes = sound.slice().buffer;
      void audio
        .resume()
        .then(() => audio.decodeAudioData(bytes))
        .then((buffer) => {
          if (disposed) return;
          const source = audio.createBufferSource();
          source.buffer = buffer;
          source.connect(audio.destination);
          source.start();
        })
        .catch(() => {});
    },
    dispose() {
      disposed = true;
      void context?.close().catch(() => {});
      context = undefined;
    },
  };
}

export type WindowAttentionBridge = Pick<
  import("../shared/terminal-bridge").TerminalBridge,
  "notify" | "onSessionAttention" | "onAttentionSound"
>;

// Main's attention verdicts become pane marks; its sound bytes play here.
export function subscribeToWindowAttention(
  bridge: WindowAttentionBridge,
  tabs: Pick<import("./terminal-tabs").TerminalTabs, "setSessionAttention">,
): () => void {
  const removeAttention = bridge.onSessionAttention((sessionId, pending) =>
    tabs.setSessionAttention(sessionId, pending),
  );
  const sound = createAttentionSound();
  const removeSound = bridge.onAttentionSound(sound.play);
  return () => {
    removeAttention();
    removeSound();
    sound.dispose();
  };
}
