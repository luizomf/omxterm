import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import {
  isSavedLayout,
  type SavedLayout,
  type InitialLayout,
} from "../shared/terminal-layout";

export type PreparedLayout = {
  initial: InitialLayout;
  directories: ReadonlyMap<string, string>;
  /** Saved folders that were unavailable, by token; the pane starts at home. */
  remembered?: ReadonlyMap<string, string>;
};

export interface RestorationWindowOptions {
  plan: PreparedLayout;
  focus(): boolean;
  accepted(): void;
}

// A timed-out filesystem operation still owns its admission slot until actual
// settlement. No retry or replacement pool can accumulate hung mount I/O.
export function createLayoutDirectoryResolver(
  inspect: (directory: string) => Promise<boolean> = async (directory) => {
    if (!(await stat(directory)).isDirectory()) return false;
    await access(directory, constants.X_OK);
    return true;
  },
  deadline = 1500,
) {
  let active = 0;
  return async (directory: string): Promise<boolean> => {
    if (active >= 2) return false;
    active++;
    const work = Promise.resolve()
      .then(() => inspect(directory))
      .catch(() => false)
      .finally(() => {
        active--;
      });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), deadline);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * Replaces each saved folder with a single-use pane token. Missing or
 * unavailable folders become home and are counted; checks run two at a time.
 */
export async function prepareSavedLayout(
  saved: SavedLayout,
  home: string,
  resolve: (directory: string) => Promise<boolean>,
): Promise<PreparedLayout> {
  const directories = new Map<string, string>();
  const remembered = new Map<string, string>();
  const initial: InitialLayout = {
    selected: saved.selected,
    tabs: [],
    fallbacks: 0,
  };
  // Bounded two-operation windows, not Promise.all over the full plan.
  for (const tab of saved.tabs) {
    const panes: string[] = [];
    for (let start = 0; start < tab.panes.length; start += 2) {
      const values = await Promise.all(
        tab.panes.slice(start, start + 2).map(async (pane) => {
          if (pane.kind === "home") return [home] as const;
          if (await resolve(pane.path)) return [pane.path] as const;
          initial.fallbacks++;
          return [home, pane.path] as const;
        }),
      );
      for (const [directory, unavailable] of values) {
        const token = randomUUID();
        panes.push(token);
        directories.set(token, directory);
        if (unavailable !== undefined) remembered.set(token, unavailable);
      }
    }
    initial.tabs.push({ ...tab, panes });
  }
  return { initial, directories, remembered };
}

export function createTerminalLayoutTransfer<Owner extends object>(options: {
  platform: string;
  home: string;
  alive(owner: Owner): boolean;
  available?(): boolean;
  create(
    plan: PreparedLayout,
    focus: () => boolean,
    accepted: () => void,
  ): Promise<void>;
  resolve?: (directory: string) => Promise<boolean>;
}) {
  const resolve = options.resolve ?? createLayoutDirectoryResolver();
  let busy = false;
  let stopped = false;
  return {
    async open(
      owner: Owner,
      input: unknown,
      focus: () => boolean,
      admit: (commit: () => void) => Promise<void>,
    ) {
      if (stopped || !options.alive(owner))
        return { ok: false, error: "unavailable" };
      if (busy || options.available?.() === false)
        return { ok: false, error: "busy" };
      if (!isSavedLayout(input) || input.platform !== options.platform)
        return { ok: false, error: "invalid-layout" };
      // Capture before asynchronous directory checks; later caller edits cannot
      // alter this particular Open intent.
      const saved = JSON.parse(JSON.stringify(input)) as SavedLayout;
      busy = true;
      let transferred = false;
      try {
        const { initial, directories } = await prepareSavedLayout(
          saved,
          options.home,
          resolve,
        );
        const fallbacks = initial.fallbacks;
        let created!: Promise<void>;
        let accept!: () => void;
        const accepted = new Promise<void>((done) => {
          accept = done;
        });
        await admit(() => {
          if (stopped || !options.alive(owner)) throw new Error("unavailable");
          transferred = true;
          created = options.create({ initial, directories }, focus, accept);
        });
        // Admission returns only after a native core owner exists. Renderer load
        // and mounts are no longer extension-owned and do not consume its budget.
        await Promise.race([
          accepted,
          created.then(() => {
            throw new Error("unavailable");
          }),
        ]);
        void created.catch(() => {});
        return { ok: true, status: "accepted", fallbacks };
      } catch {
        return {
          ok: false,
          error: transferred ? "outcome-unknown" : "unavailable",
        };
      } finally {
        busy = false;
      }
    },
    dispose() {
      stopped = true;
    },
  };
}
