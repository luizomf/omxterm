import { readFile } from "node:fs/promises";
import type { Plugin } from "esbuild";

// Mutate only a fixture build, never the tracked controller or product bundle.
export function resttyLinkCancellationMutation(
  cancellation: "pointercancel" | "blur",
): Plugin {
  return {
    name: `restty-link-${cancellation}-mutation`,
    setup(api) {
      api.onLoad({ filter: /restty-visible-links\.ts$/ }, async (args) => {
        const contents = await readFile(args.path, "utf8");
        const listener =
          cancellation === "pointercancel"
            ? 'canvas.addEventListener("pointercancel", onPointerCancel, true);'
            : 'window.addEventListener("blur", onBlur);';
        if (contents.split(listener).length !== 2)
          throw new Error("Cancellation mutation listener seam drift");
        return { contents: contents.replace(listener, ""), loader: "ts" };
      });
    },
  };
}
