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
        const directories = new Map<string, string>();
        let fallbacks = 0;
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
                if (pane.kind === "home") return options.home;
                if (await resolve(pane.path)) return pane.path;
                fallbacks++;
                return options.home;
              }),
            );
            for (const directory of values) {
              const token = randomUUID();
              panes.push(token);
              directories.set(token, directory);
            }
          }
          initial.tabs.push({ ...tab, panes });
        }
        initial.fallbacks = fallbacks;
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
