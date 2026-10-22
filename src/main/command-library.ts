import {
  validateCommandDefinition,
  validateCommandLibrary,
  type CommandDefinition,
  type CommandLibraryDocument,
} from "../shared/commands";
import {
  createApplicationDocumentStore,
  type ApplicationDocumentLoad,
} from "./application-data";

export interface CommandLibraryService {
  load(): Promise<ApplicationDocumentLoad<CommandLibraryDocument>>;
  current(): CommandLibraryDocument;
  saveCommand(value: unknown): Promise<CommandDefinition>;
  deleteCommand(id: string): Promise<void>;
  setFavorite(id: string, favorite: boolean): Promise<void>;
  setHidden(id: string, hidden: boolean): Promise<void>;
  // Which of the named programs exist on PATH, without running a shell.
  availability(tools: readonly string[]): Record<string, boolean>;
  // Forget cached PATH lookups so newly installed programs are found.
  refreshTools(): void;
  subscribe(listener: (document: CommandLibraryDocument) => void): () => void;
  // Decodes a backup's document now (throwing if it is invalid) and returns
  // the commit that replaces the current one, run in mutation order.
  prepareRestore(bytes: Uint8Array): () => Promise<void>;
}

const EMPTY: CommandLibraryDocument = { custom: [], favorites: [], hidden: [] };
const TOOL = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u;
const MAX_TOOLS = 128;

// Custom commands, favorites and hidden built-ins in commands.json
// (Application Data, ADR 0034). Built-in templates ship with OMXTerm.
export function createCommandLibraryService(options: {
  readonly directory: string;
  readonly findExecutable: (name: string) => string | undefined;
}): CommandLibraryService {
  const store = createApplicationDocumentStore<CommandLibraryDocument>(
    {
      fileName: "commands.json",
      version: 1,
      empty: () => EMPTY,
      validate: validateCommandLibrary,
    },
    { directory: options.directory },
  );
  let document = EMPTY;
  const listeners = new Set<(document: CommandLibraryDocument) => void>();
  const tools = new Map<string, boolean>();
  let queue: Promise<unknown> = Promise.resolve();
  const commit = <T>(
    mutate: (current: CommandLibraryDocument) => {
      readonly next: CommandLibraryDocument;
      readonly result: T;
    },
  ): Promise<T> => {
    const run = queue.then(async () => {
      const { next, result } = mutate(document);
      const validated = validateCommandLibrary(next);
      await store.save(validated);
      document = validated;
      for (const listener of listeners) listener(document);
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  };
  const toggle = (list: readonly string[], id: string, on: boolean) =>
    on ? [...new Set([...list, id])] : list.filter((item) => item !== id);

  return {
    async load() {
      const loaded = await store.load();
      document = loaded.value;
      return loaded;
    },
    current: () => document,
    async saveCommand(value) {
      const command = validateCommandDefinition(value);
      return commit((current) => {
        const exists = current.custom.some((item) => item.id === command.id);
        return {
          next: {
            ...current,
            custom: exists
              ? current.custom.map((item) =>
                  item.id === command.id ? command : item,
                )
              : [...current.custom, command],
          },
          result: command,
        };
      });
    },
    deleteCommand(id) {
      return commit((current) => ({
        next: {
          custom: current.custom.filter((item) => item.id !== id),
          favorites: current.favorites.filter((item) => item !== id),
          hidden: current.hidden.filter((item) => item !== id),
        },
        result: undefined,
      }));
    },
    setFavorite(id, favorite) {
      return commit((current) => ({
        next: {
          ...current,
          favorites: toggle(current.favorites, id, favorite),
        },
        result: undefined,
      }));
    },
    setHidden(id, hidden) {
      return commit((current) => ({
        next: { ...current, hidden: toggle(current.hidden, id, hidden) },
        result: undefined,
      }));
    },
    availability(names) {
      const result: Record<string, boolean> = {};
      for (const name of names.slice(0, MAX_TOOLS)) {
        if (!TOOL.test(name)) continue;
        let available = tools.get(name);
        if (available === undefined) {
          available = options.findExecutable(name) !== undefined;
          tools.set(name, available);
        }
        result[name] = available;
      }
      return result;
    },
    refreshTools() {
      tools.clear();
    },
    prepareRestore(bytes) {
      const next = store.decode(bytes);
      return () => commit(() => ({ next, result: undefined }));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
