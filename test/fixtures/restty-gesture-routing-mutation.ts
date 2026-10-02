import { readFile } from "node:fs/promises";
import type { Plugin } from "esbuild";

export type ResttyGestureControl = "move" | "up" | "middle";

export function resttyGestureRoutingMutation(
  control: ResttyGestureControl,
): Plugin {
  if (control !== "middle") return resttyGestureReplayMutation(control);
  return {
    name: "restty-gesture-middle-release-loss",
    setup(api) {
      api.onLoad(
        { filter: /electron-terminal-adapter\.ts$/ },
        async ({ path }) => {
          const contents = await readFile(path, "utf8");
          const needle = "    write(data: string) {";
          if (contents.split(needle).length !== 2)
            throw new Error("Middle report sink seam drift");
          // Drop a real pinned-encoder release at its Adapter sink. Preserve every
          // other byte and every press; never alter the expected evidence.
          return {
            contents: contents.replace(
              needle,
              `${needle}\n      if (data === "\\x1b[<1;4;1m" || data === "\\x1b[<17;4;1m") return;`,
            ),
            loader: "ts",
          };
        },
      );
    },
  };
}

// Only fixture builds lose the actual production replay call. No expected
// evidence is fabricated, and neither tracked product code nor installed
// dependency bytes are modified.
export function resttyGestureReplayMutation(fallback: "move" | "up"): Plugin {
  return {
    name: `restty-gesture-${fallback}-replay-mutation`,
    setup(api) {
      api.onLoad({ filter: /restty-visible-links\.ts$/ }, async (args) => {
        const contents = await readFile(args.path, "utf8");
        const call =
          fallback === "move"
            ? "replayDown(cancelled);"
            : "replayDown(gesture);";
        if (contents.split(call).length !== 2)
          throw new Error("Gesture replay mutation seam drift");
        return { contents: contents.replace(call, ""), loader: "ts" };
      });
    },
  };
}
