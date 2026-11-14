import { subscribeToAgentAccess } from "./agent-access";

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
          // Release the output device once the sound ends.
          source.addEventListener("ended", () => void audio.suspend(), {
            once: true,
          });
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
  "notify" | "onSessionAttention" | "onAttentionSound" | "agent"
>;

// Main's per-window verdicts become marks: a session's attention and the
// window's agent grant (ADR 0052). The user's sound bytes play here.
export function subscribeToWindowAttention(
  bridge: WindowAttentionBridge,
  tabs: Pick<
    import("./terminal-tabs").TerminalTabs,
    | "setSessionAttention"
    | "setWindowMark"
    | "flash"
    | "readSession"
    | "encodeSessionKeys"
    | "sessionModes"
    | "agentTabs"
    | "runSessionCommand"
    | "cancelAgentCommands"
  >,
): () => void {
  const removeAttention = bridge.onSessionAttention((sessionId, pending) =>
    tabs.setSessionAttention(sessionId, pending),
  );
  const sound = createAttentionSound();
  const removeSound = bridge.onAttentionSound(sound.play);
  const removeAgent = bridge.agent
    ? subscribeToAgentAccess(bridge.agent, tabs)
    : undefined;
  return () => {
    removeAttention();
    removeSound();
    removeAgent?.();
    sound.dispose();
  };
}
