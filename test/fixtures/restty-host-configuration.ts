import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import { createUserConfigurationReloader } from "../../src/main/user-configuration-reloader";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import type { TerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import { HOST_IMAGE_THEME_B } from "./restty-image-theme";
import { nativeFixturePlatform } from "./restty-host-platform";
import {
  installedFontData,
  installedFallbackFontData,
} from "../../src/main/installed-font-family";

export async function loadResttyHostFont(
  family: string | undefined,
  beforeLoad: () => Promise<void>,
) {
  await beforeLoad();
  const { configuredFontFamily, reloadedFontFamily } = nativeFixturePlatform;
  if (family !== configuredFontFamily && family !== reloadedFontFamily)
    throw new Error("Unexpected configured font request");
  const data = await installedFontData(family);
  if (!data) throw new Error("Configured native fixture font is missing");
  return {
    configured: { family, data },
    fallbacks: await installedFallbackFontData(),
  };
}

export function initialResttyHostConfiguration(focusedImage = false) {
  return {
    ...DEFAULT_USER_CONFIGURATION,
    fontFamily: nativeFixturePlatform.configuredFontFamily,
    terminalTheme: focusedImage
      ? HOST_IMAGE_THEME_B
      : DEFAULT_USER_CONFIGURATION.terminalTheme,
  };
}

export function createResttyHostConfigurationReloader(
  router: TerminalIpcRouter,
  controller: ReturnType<TerminalIpcRouter["registerController"]>,
  focusedImage: boolean,
) {
  const { configuredFontFamily, reloadedFontFamily } = nativeFixturePlatform;
  const initial = initialResttyHostConfiguration(focusedImage);
  const changed = {
    ...initial,
    fontFamily: reloadedFontFamily,
    fontLineHeight: 1.25,
    fontLigatures: false,
    fontSize: 18,
    terminalTheme: HOST_IMAGE_THEME_B,
  };
  const restored = {
    ...DEFAULT_USER_CONFIGURATION,
    fontFamily: configuredFontFamily,
  };
  const reloads = focusedImage ? [restored] : [changed, restored];
  return createUserConfigurationReloader({
    initial: { configuration: initial, userFileErrors: [] },
    load: async () => ({ configuration: reloads.shift()! }),
    apply: (state) =>
      controller.applyConfiguration(terminalRendererConfiguration(state, 0)),
    terminalSurfaceFontBaseline: {
      fontFamily: configuredFontFamily,
      fontLineHeight: 1,
    },
    activeTerminalSurfaceFontConfigurations: () =>
      router.activeTerminalSurfaceFontConfigurations(),
  });
}
