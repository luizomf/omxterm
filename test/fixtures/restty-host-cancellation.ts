import { writeSync } from "node:fs";
import {
  completeHoverControl,
  selectHoverControl,
} from "./restty-hover-control";
import { exerciseResttyLinkCancellation } from "./restty-link-cancellation";
import type { LaunchRequest } from "../../src/main/launch-request";
import type { LocalImageRequest } from "../../src/shared/local-image";
import { nativeFixturePlatform } from "./restty-host-platform";

const readyMarker = "__OMXTERM_CANCELLATION_READY__";

export function cancellationFixtureLaunchRequest(): LaunchRequest {
  return {
    kind: "explicit-command",
    executable: nativeFixturePlatform.defaultShell,
    arguments:
      process.platform === "win32"
        ? [
            "-NoLogo",
            "-NoProfile",
            "-Command",
            `[Console]::WriteLine('${readyMarker}'); while ($true) { [Console]::ReadKey($true) | Out-Null }`,
          ]
        : [
            "-c",
            `stty -echo || exit 1; printf '${readyMarker}\\n'; IFS= read -r keepAlive`,
          ],
  };
}

export function isFocused(argv: readonly string[]): boolean {
  return (
    argv.includes("--link-cancellation") ||
    selectHoverControl(argv) !== undefined
  );
}

type CancellationOptions = Parameters<typeof exerciseResttyLinkCancellation>[0];

export async function completeResttyLinkCancellationScenario(
  options: CancellationOptions & {
    readonly localImageRequests: LocalImageRequest[];
    readonly resizes: readonly {
      readonly cols: number;
      readonly rows: number;
    }[];
    readonly initialOutput: () => string;
    readonly closeSession: () => void;
    readonly ptyExits: () => number;
    readonly sessionStarts: () => number;
    readonly complete: (code: number) => Promise<void>;
  },
) {
  const control = selectHoverControl(process.argv);
  if (control) {
    await completeHoverControl({ ...options, control });
    return;
  }
  // The real child disables echo before readiness. Otherwise ordinary reporting
  // controls can echo into the URL and change later cancellation destinations.
  await options.waitFor(
    () => options.initialOutput().includes(readyMarker),
    "cancellation scenario non-echoing PTY readiness",
  );
  const size = options.resizes.at(-1);
  if (!size) throw new Error("Cancellation scenario has no live grid");
  const linkCancellation = await exerciseResttyLinkCancellation(options, size);
  options.closeSession();
  await options.waitFor(
    () => options.ptyExits() === 1,
    "cancellation scenario native PTY exit",
  );
  writeSync(
    1,
    "__OMXTERM_RESTTY_HOST_RESULT__" +
      JSON.stringify({
        linkCancellation,
        externalLinks: options.externalLinks,
        sessionStarts: options.sessionStarts(),
        ptyExits: options.ptyExits(),
      }) +
      "\n",
  );
  await options.complete(0);
}
