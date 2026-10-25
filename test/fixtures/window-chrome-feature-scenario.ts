import { createFeatureSmoke } from "./feature-native-smoke";
import { FEATURE_SMOKE_FLAG } from "./feature-native-smoke-contract";
import { explicitFixtureLaunchRequest } from "./restty-host-platform";
import {
  SHORTCUT_CAPTURE_FLAG,
  createShortcutPtyObservation,
  exerciseShortcutCapture,
  shortcutCaptureLaunchRequest,
} from "./settings-shortcut-native";

// The two independent feature scenarios reuse the same real window/Surface/PTY
// host. Ordinary Window Chrome and the existing feature smoke keep their inputs.
export function createWindowChromeFeatureScenario() {
  const original = createFeatureSmoke(
    process.argv.includes(FEATURE_SMOKE_FLAG),
  );
  const shortcuts = process.argv.includes(SHORTCUT_CAPTURE_FLAG);
  const pty = createShortcutPtyObservation();
  let quitConfirmations = 0;
  return {
    ...original,
    enabled: original.enabled || shortcuts,
    launchRequest: () =>
      shortcuts
        ? shortcutCaptureLaunchRequest()
        : explicitFixtureLaunchRequest(),
    observeOutput(index: number, data: string) {
      if (shortcuts) pty.observe(data);
      original.observeOutput(index, data);
    },
    async confirmQuit() {
      quitConfirmations += 1;
      return false;
    },
    async run(options: Parameters<typeof original.run>[0]) {
      if (!shortcuts) return original.run(options);
      const control = process.argv.includes("--shortcut-control-repeat")
        ? "repeat"
        : process.argv.includes("--shortcut-control-release")
          ? "release"
          : "none";
      return {
        shortcuts: await exerciseShortcutCapture({
          ...options,
          input: pty.input,
          quitConfirmations: () => quitConfirmations,
          control,
        }),
      };
    },
  };
}
