import {
  DEFAULT_HIGHLIGHT_SETTINGS,
  validateHighlightSettings,
  type HighlightSettings,
} from "../shared/highlight-settings";
import {
  createApplicationDocumentStore,
  type ApplicationDocumentLoad,
} from "./application-data";

export interface HighlightSettingsService {
  load(): Promise<ApplicationDocumentLoad<HighlightSettings>>;
  current(): HighlightSettings;
  save(value: unknown): Promise<HighlightSettings>;
  subscribe(listener: (settings: HighlightSettings) => void): () => void;
  // Decodes backed-up settings now and returns the save that applies them.
  prepareRestore(bytes: Uint8Array): () => Promise<unknown>;
}

// Output highlighting preferences and custom rules, kept as Application
// Data in highlights.json beside config.json (ADR 0034).
export function createHighlightSettingsService(
  directory: string,
): HighlightSettingsService {
  const store = createApplicationDocumentStore<HighlightSettings>(
    {
      fileName: "highlights.json",
      version: 1,
      empty: () => DEFAULT_HIGHLIGHT_SETTINGS,
      validate: validateHighlightSettings,
    },
    { directory },
  );
  let settings = DEFAULT_HIGHLIGHT_SETTINGS;
  const listeners = new Set<(settings: HighlightSettings) => void>();
  let queue: Promise<unknown> = Promise.resolve();
  const save = (value: unknown): Promise<HighlightSettings> => {
    const validated = validateHighlightSettings(value);
    const write = queue.then(async () => {
      await store.save(validated);
      settings = validated;
      for (const listener of listeners) listener(settings);
      return settings;
    });
    queue = write.catch(() => undefined);
    return write;
  };
  return {
    async load() {
      const loaded = await store.load();
      settings = loaded.value;
      return loaded;
    },
    current: () => settings,
    save,
    prepareRestore(bytes) {
      const next = store.decode(bytes);
      return () => save(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
