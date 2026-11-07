import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const helper = path.resolve(
  import.meta.dirname,
  "../../scripts/install-linux-appimage.sh",
);

type HelperObservation = { started: number; exited?: number; closed?: number };

// Local ownership for the synthetic installer tests, not a native supervisor.
export function createAppImageInstallerFixture() {
  const roots = new Map<
    string,
    {
      created: number;
      nextInvocation: number;
      pending: Map<number, HelperObservation>;
      lastSettled?: HelperObservation & {
        invocation: number;
        finished: number;
      };
    }
  >();
  return {
    async fixtureRoot() {
      const root = await mkdtemp(
        path.join(tmpdir(), "omxterm-installer-test-"),
      );
      roots.set(root, {
        created: performance.now(),
        nextInvocation: 0,
        pending: new Map(),
      });
      const bin = path.join(root, "bin");
      await mkdir(bin);
      await writeFile(
        path.join(bin, "uname"),
        "#!/bin/sh\nprintf '%s\\n' 'aarch64'\n",
        { mode: 0o755 },
      );
      await writeFile(
        path.join(bin, "file"),
        "#!/bin/sh\nprintf '%s\\n' 'ELF 64-bit LSB executable, ARM aarch64'\n",
        { mode: 0o755 },
      );
      return { root, home: path.join(root, "home"), bin };
    },
    async runHelper(
      home: string,
      bin: string,
      arguments_: string[],
      extraEnvironment: NodeJS.ProcessEnv = {},
    ) {
      const owner = roots.get(path.dirname(bin));
      if (!owner) throw new Error("Installer fixture root is no longer active");
      const invocation = ++owner.nextInvocation;
      const observation: HelperObservation = { started: performance.now() };
      owner.pending.set(invocation, observation);
      try {
        // Keep the original promisified result/error; events only observe the
        // child and do not establish why its execFile settlement is pending.
        const result = execFile("/bin/sh", [helper, ...arguments_], {
          env: {
            ...process.env,
            HOME: home,
            HYPRLAND_INSTANCE_SIGNATURE: "",
            PATH: `${bin}:${process.env.PATH ?? ""}`,
            ...extraEnvironment,
          },
        });
        result.child?.once("exit", () => {
          observation.exited = performance.now();
        });
        result.child?.once("close", () => {
          observation.closed = performance.now();
        });
        return await result;
      } finally {
        owner.pending.delete(invocation);
        owner.lastSettled = {
          ...observation,
          invocation,
          finished: performance.now(),
        };
      }
    },
    async cleanup(failed = false) {
      const now = performance.now();
      const selected = [...roots].map(([root, owner]) => {
        const pending = [...owner.pending];
        // Snapshot all reported state before any root removal can yield.
        const diagnostics = pending.slice(0, 8).map(([invocation, state]) => {
          const elapsed = Math.max(0, Math.round(now - state.started));
          const exit =
            state.exited === undefined
              ? "exit not observed"
              : `exit observed ${Math.max(0, Math.round(now - state.exited))}ms ago`;
          return `invocation #${invocation}: elapsed ${elapsed}ms, ${exit}, close ${state.closed === undefined ? "not observed" : "observed"}, execFile settlement pending`;
        });
        if (pending.length > 8)
          diagnostics.push(`${pending.length - 8} more pending`);
        return { root, pending: pending.length, diagnostics };
      });
      if (failed) {
        const summaries = [...roots.values()]
          .slice(0, 4)
          .map((owner, index) => {
            const duration = (end: number, start: number) =>
              Math.max(0, Math.round(end - start));
            let summary = `root #${index + 1}: age ${duration(now, owner.created)}ms, started ${owner.nextInvocation}, pending ${owner.pending.size}`;
            const last = owner.lastSettled;
            if (last) {
              const exit =
                last.exited === undefined
                  ? "exit not observed"
                  : `exit at ${duration(last.exited, last.started)}ms`;
              const close =
                last.closed === undefined
                  ? "close not observed"
                  : `close at ${duration(last.closed, last.started)}ms`;
              summary += `, last settled #${last.invocation}: elapsed ${duration(last.finished, last.started)}ms, ${exit}, ${close}`;
            }
            return summary;
          });
        if (roots.size > 4) summaries.push(`${roots.size - 4} more roots`);
        console.error(
          `Installer fixture failure snapshot: ${summaries.join("; ") || "no active roots"}`,
        );
      }
      // Retire helper admission before any await: timed-out tests can resume.
      // Later cleanup never deletes a root retained by this invocation.
      roots.clear();
      const errors: unknown[] = [];
      for (const { root, pending, diagnostics } of selected) {
        if (pending > 0) {
          errors.push(
            new Error(
              `Retained installer fixture: ${root}; ${diagnostics.join("; ")}`,
            ),
          );
          continue;
        }
        try {
          await rm(root, { recursive: true, force: true });
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length)
        throw new AggregateError(
          errors,
          "Installer fixture cleanup incomplete; helper settlement incomplete or root removal failed",
        );
    },
  };
}
