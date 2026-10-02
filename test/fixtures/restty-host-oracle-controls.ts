import { readFile } from "node:fs/promises";
import type { Plugin } from "esbuild";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import { outputRecord } from "./restty-output-checkpoint";
import { siblingResponseToken } from "./restty-sibling-response";

export type HostOracleRendererControl =
  "drop-output" | "skip-palette" | "delete-images";

export function createHostOracleSourceControl(arguments_: readonly string[]) {
  const reorder = arguments_.includes("--reorder-output");
  const omit = arguments_.includes("--omit-sibling-response");
  const needle = omit
    ? siblingResponseToken
    : outputRecord(100) + outputRecord(101);
  let tail = "";
  let applied = false;
  return {
    transform(index: number, data: string): string {
      if ((!reorder && !omit) || index !== 0 || applied) return data;
      const combined = tail + data;
      const at = combined.indexOf(needle);
      if (at >= 0) {
        applied = true;
        tail = "";
        return (
          combined.slice(0, at) +
          (omit ? "" : outputRecord(101) + outputRecord(100)) +
          combined.slice(at + needle.length)
        );
      }
      const deliver = Math.max(0, combined.length - needle.length + 1);
      tail = combined.slice(deliver);
      return combined.slice(0, deliver);
    },
    evidence: () => ({
      reorder,
      omit,
      applied,
      retainedCodeUnits: tail.length,
    }),
  };
}

export function resttyHostOracleRendererControl(
  control: HostOracleRendererControl,
): Plugin {
  return {
    name: `restty-host-oracle-${control}`,
    setup(api) {
      api.onLoad(
        {
          filter:
            control === "drop-output"
              ? /electron-terminal-adapter\.ts$/
              : /restty-terminal-surface\.ts$/,
        },
        async ({ path }) => {
          let contents = await readFile(path, "utf8");
          const replace = (needle: string, replacement: string) => {
            if (contents.split(needle).length !== 2)
              throw new Error(`Pinned ${control} seam drift`);
            contents = contents.replace(needle, replacement);
          };
          if (control === "drop-output") {
            replace(
              "      const deliverOutput = (",
              "      let fixtureTail = ''; let fixtureDropped = false;\n      const deliverOutput = (",
            );
            replace(
              "        handlers.onOutput(data);",
              `
        if (!fixtureDropped) {
          const combined = fixtureTail + data;
          const needle = ${JSON.stringify(outputRecord(100))};
          const at = combined.indexOf(needle);
          if (at >= 0) { data = combined.slice(0, at) + combined.slice(at + needle.length); fixtureDropped = true; fixtureTail = ''; }
          else { const deliver = Math.max(0, combined.length - needle.length + 1); data = combined.slice(0, deliver); fixtureTail = combined.slice(deliver); }
        }
        handlers.onOutput(data);`,
            );
            // The original bridge.acknowledgeOutput(source,end) remains unchanged.
          } else {
            const predicate = `theme.name === ${JSON.stringify(DEFAULT_TERMINAL_THEME.name)}`;
            if (control === "skip-palette") {
              const call =
                '    pane?.runtime.terminal.applyTheme(toGhosttyTheme(theme), "OMXTerm");';
              replace(call, `    if (!(${predicate})) ${call.trim()}`);
            } else {
              replace(
                "  const applyRuntimeTheme = (theme: TerminalTheme) => {",
                `  const applyRuntimeTheme = (theme: TerminalTheme) => {\n    if (${predicate}) ptyCallbacks?.onData?.("\\x1b_Ga=d,d=A,q=2;\\x1b\\\\");`,
              );
            }
          }
          return { contents, loader: "ts" };
        },
      );
    },
  };
}
