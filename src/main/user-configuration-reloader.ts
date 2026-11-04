import { translatorFor } from "../shared/i18n";
import {
  settingsMessageText,
  type SettingsMessage,
} from "../shared/settings-messages";
import type { OperationalEventLog } from "./operational-events";
import {
  configurationRejectionReason,
  type LoadedUserConfiguration,
  type UserConfigurationFallback,
  type UserConfigurationLoad,
} from "./user-configuration";

export interface ActiveUserConfiguration {
  readonly configuration: LoadedUserConfiguration;
  readonly userFileErrors: readonly string[];
}

interface UserConfigurationReloaderOptions {
  readonly initial: ActiveUserConfiguration;
  readonly load: () => Promise<UserConfigurationLoad>;
  readonly apply: (state: ActiveUserConfiguration, committed: boolean) => void;
  readonly operationalEvents?: Pick<OperationalEventLog, "setLevel" | "write">;
  readonly writeStderr?: (detail: string) => void;
  readonly now?: () => number;
  readonly terminalSurfaceFontBaseline?: Pick<
    LoadedUserConfiguration,
    "fontFamily" | "fontLineHeight"
  >;
  readonly activeTerminalSurfaceFontConfigurations?: () => readonly Pick<
    LoadedUserConfiguration,
    "fontFamily" | "fontLineHeight"
  >[];
}

// What a reload actually did: applied with its current notices (warnings and
// deferred restart-only settings), or rejected with the reported reason.
export type UserConfigurationReloadOutcome =
  | { readonly applied: true; readonly notices: readonly SettingsMessage[] }
  | { readonly applied: false; readonly notice: SettingsMessage };

export interface UserConfigurationReloader {
  current(): ActiveUserConfiguration;
  reload(): Promise<UserConfigurationReloadOutcome>;
  refreshTerminalSurfaceNotices(): void;
}

export function terminalSurfaceFontBaseline(
  configuration: LoadedUserConfiguration,
): Pick<UserConfigurationReloaderOptions, "terminalSurfaceFontBaseline"> {
  return {
    terminalSurfaceFontBaseline: {
      ...(configuration.fontFamily === undefined
        ? {}
        : { fontFamily: configuration.fontFamily }),
      fontLineHeight: configuration.fontLineHeight,
    },
  };
}

// Requests are serialized rather than coalesced: every explicit action performs
// one complete load, and commits occur in request order. A window created while
// I/O is pending sees the previous whole snapshot; after the synchronous commit
// it sees the new whole snapshot.
export function createUserConfigurationReloader(
  options: UserConfigurationReloaderOptions,
): UserConfigurationReloader {
  let active = freezeState(
    options.initial.configuration,
    options.initial.userFileErrors,
  );
  let queue: Promise<unknown> = Promise.resolve();
  let otherNotices: readonly SettingsMessage[] = options.initial.userFileErrors;
  const now = options.now ?? Date.now;
  const noticesFor = (configuration: LoadedUserConfiguration) =>
    currentNotices(
      configuration,
      otherNotices,
      options.terminalSurfaceFontBaseline,
      options.activeTerminalSurfaceFontConfigurations?.(),
    );
  const renderNotices = (
    configuration: LoadedUserConfiguration,
    notices: readonly SettingsMessage[],
  ) =>
    notices.map((notice) =>
      settingsMessageText(notice, translatorFor(configuration.language).t),
    );

  const run = async (): Promise<UserConfigurationReloadOutcome> => {
    const startedAt = now();
    options.operationalEvents?.write({
      name: "configuration.reload.requested",
      trigger: "manual",
      durationMs: 0,
    });
    try {
      const load = await options.load();
      if (load.fallback) return reject(load.fallback, startedAt);
      otherNotices = load.warnings ?? [];
      const notices = noticesFor(load.configuration);
      active = freezeState(
        load.configuration,
        renderNotices(load.configuration, notices),
      );
      options.operationalEvents?.setLevel(load.configuration.logLevel);
      options.apply(active, true);
      options.operationalEvents?.write({
        name: "configuration.reload.succeeded",
        trigger: "manual",
        durationMs: elapsedMilliseconds(startedAt, now()),
      });
      return { applied: true, notices };
    } catch {
      return reject(undefined, startedAt);
    }
  };

  const reject = (
    fallback: UserConfigurationFallback | undefined,
    startedAt: number,
  ): UserConfigurationReloadOutcome => {
    const notice: SettingsMessage = {
      kind: "reload",
      ...(fallback
        ? {
            detail: fallback.error.message
              .replace(" Fix the file and restart OMXTerm.", "")
              .slice(0, 65_536),
          }
        : {}),
    };
    const rendered = settingsMessageText(
      notice,
      translatorFor(active.configuration.language).t,
    );
    options.writeStderr?.(`${rendered}\n`);
    otherNotices = [notice];
    active = freezeState(
      active.configuration,
      renderNotices(active.configuration, noticesFor(active.configuration)),
    );
    options.apply(active, false);
    options.operationalEvents?.write({
      name: "configuration.reload.rejected",
      trigger: "manual",
      durationMs: elapsedMilliseconds(startedAt, now()),
      reason: fallback
        ? configurationRejectionReason(fallback.error, fallback.surface)
        : "unexpected-failure",
    });
    return { applied: false, notice };
  };

  return {
    current: () => active,
    // Surface retirement is not another reload: keep current diagnostics and
    // settings, and publish only if the deferred information actually changed.
    refreshTerminalSurfaceNotices() {
      const messages = renderNotices(
        active.configuration,
        noticesFor(active.configuration),
      );
      if (
        messages.length === active.userFileErrors.length &&
        messages.every(
          (message, index) => message === active.userFileErrors[index],
        )
      )
        return;
      active = freezeState(active.configuration, messages);
      options.apply(active, false);
    },
    reload() {
      const request = queue.then(run, run);
      queue = request.catch(() => {});
      return request;
    },
  };
}

function freezeState(
  configuration: LoadedUserConfiguration,
  userFileErrors: readonly string[],
): ActiveUserConfiguration {
  return Object.freeze({
    configuration,
    userFileErrors: Object.freeze([...userFileErrors]),
  });
}

function currentNotices(
  configuration: LoadedUserConfiguration,
  warnings: readonly SettingsMessage[],
  baseline:
    Pick<LoadedUserConfiguration, "fontFamily" | "fontLineHeight"> | undefined,
  activeSurfaces:
    | readonly Pick<LoadedUserConfiguration, "fontFamily" | "fontLineHeight">[]
    | undefined,
): readonly SettingsMessage[] {
  // An authoritative empty owner list means no surviving Surface needs a
  // restart. The startup baseline is only for compositions without ownership.
  const surfaces = activeSurfaces ?? (baseline ? [baseline] : []);
  const deferred: ("font.family" | "font.lineHeight")[] = [
    ...(surfaces.every(
      (surface) => configuration.fontFamily === surface.fontFamily,
    )
      ? []
      : ["font.family" as const]),
    ...(surfaces.every(
      (surface) => configuration.fontLineHeight === surface.fontLineHeight,
    )
      ? []
      : ["font.lineHeight" as const]),
  ];
  if (deferred.length === 0) return warnings;
  return [...warnings, { kind: "deferred", fields: deferred }];
}

const MAX_RELOAD_DURATION_MS = 86_400_000;

function elapsedMilliseconds(startedAt: number, endedAt: number): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return 0;
  return Math.min(
    MAX_RELOAD_DURATION_MS,
    Math.max(0, Math.round(endedAt - startedAt)),
  );
}
