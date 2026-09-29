import { randomUUID } from "node:crypto";
import type { TerminalRendererConfiguration } from "../shared/user-configuration";
import type { TerminalSurfaceFontConfiguration } from "./terminal-ipc-types";

export function surfaceFontConfiguration(
  configuration: TerminalSurfaceFontConfiguration,
): TerminalSurfaceFontConfiguration {
  return Object.freeze({
    ...(configuration.fontFamily === undefined
      ? {}
      : { fontFamily: configuration.fontFamily }),
    fontLineHeight: configuration.fontLineHeight,
  });
}

export function activeSessionFontConfigurations(
  sessions: Iterable<{
    readonly exited: boolean;
    readonly terminalSurfaceFontConfiguration?: TerminalSurfaceFontConfiguration;
  }>,
): readonly TerminalSurfaceFontConfiguration[] {
  return [...sessions].flatMap((state) =>
    state.exited || !state.terminalSurfaceFontConfiguration
      ? []
      : [state.terminalSurfaceFontConfiguration],
  );
}

/** Font snapshots are issued by one renderer owner, never claimed as values. */
export function createSurfaceFontOwnership(reject: () => void) {
  const configurations = new Map<string, TerminalSurfaceFontConfiguration>();
  const surfaces = new Map<
    string,
    {
      readonly configuration: TerminalSurfaceFontConfiguration;
      started: boolean;
    }
  >();
  let currentId: string | undefined;

  const configure = (configuration: TerminalRendererConfiguration) => {
    const current = currentId ? configurations.get(currentId) : undefined;
    if (
      !current ||
      current.fontFamily !== configuration.fontFamily ||
      current.fontLineHeight !== configuration.fontLineHeight
    ) {
      currentId = randomUUID();
      configurations.set(currentId, surfaceFontConfiguration(configuration));
    }
    return Object.freeze({ ...configuration, fontConfigurationId: currentId! });
  };
  const retain = (id: unknown) => {
    const configuration =
      typeof id === "string" ? configurations.get(id) : undefined;
    if (!configuration) {
      reject();
      throw new TypeError("Unknown Surface font configuration");
    }
    const surfaceId = randomUUID();
    surfaces.set(surfaceId, { configuration, started: false });
    return surfaceId;
  };
  const start = (id: unknown) => {
    const surface = typeof id === "string" ? surfaces.get(id) : undefined;
    if (!surface || surface.started) {
      reject();
      throw new TypeError("Invalid terminal start payload");
    }
    surface.started = true;
    return surface.configuration;
  };
  return {
    configure,
    start,
    requests: {
      retainSurface: retain,
      releaseSurface(id: unknown) {
        if (typeof id !== "string" || !surfaces.delete(id)) reject();
      },
      // Messages preceding this acknowledgement have already retained their
      // snapshots. Surviving Surfaces own those values independently.
      configurationObserved(id: unknown) {
        if (typeof id !== "string" || !configurations.has(id)) {
          reject();
          return;
        }
        for (const key of configurations.keys()) {
          if (key === id) break;
          configurations.delete(key);
        }
      },
    },
    active: () =>
      [...surfaces.values()].map((surface) => surface.configuration),
    dispose() {
      configurations.clear();
      surfaces.clear();
    },
  };
}
