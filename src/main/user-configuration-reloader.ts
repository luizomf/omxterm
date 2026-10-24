import { translatorFor, type Translator } from "../shared/i18n";
import { MAX_USER_FILE_ERROR_LENGTH } from "../shared/user-configuration";
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

export interface UserConfigurationReloader {
  current(): ActiveUserConfiguration;
  reload(): Promise<void>;
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
  let queue = Promise.resolve();
  const now = options.now ?? Date.now;

  const run = async () => {
    const startedAt = now();
    options.operationalEvents?.write({
      name: "configuration.reload.requested",
      trigger: "manual",
      durationMs: 0,
    });
    try {
      const load = await options.load();
      if (load.fallback) {
        reject(load.fallback, startedAt);
        return;
      }
      active = freezeState(
        load.configuration,
        currentNotices(
          translatorFor(load.configuration.language),
          load.configuration,
          load.warnings ?? [],
          options.terminalSurfaceFontBaseline,
          options.activeTerminalSurfaceFontConfigurations?.(),
        ),
      );
      options.operationalEvents?.setLevel(load.configuration.logLevel);
      options.apply(active, true);
      options.operationalEvents?.write({
        name: "configuration.reload.succeeded",
        trigger: "manual",
        durationMs: elapsedMilliseconds(startedAt, now()),
      });
    } catch {
      reject(undefined, startedAt);
    }
  };

  const reject = (
    fallback: UserConfigurationFallback | undefined,
    startedAt: number,
  ) => {
    const notice = boundedReloadNotice(
      translatorFor(active.configuration.language),
      fallback,
    );
    options.writeStderr?.(`${notice}\n`);
    active = freezeState(active.configuration, [notice]);
    options.apply(active, false);
    options.operationalEvents?.write({
      name: "configuration.reload.rejected",
      trigger: "manual",
      durationMs: elapsedMilliseconds(startedAt, now()),
      reason: fallback
        ? configurationRejectionReason(fallback.error, fallback.surface)
        : "unexpected-failure",
    });
  };

  return {
    current: () => active,
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
  { t }: Translator,
  configuration: LoadedUserConfiguration,
  warnings: readonly string[],
  baseline:
    Pick<LoadedUserConfiguration, "fontFamily" | "fontLineHeight"> | undefined,
  activeSurfaces:
    | readonly Pick<LoadedUserConfiguration, "fontFamily" | "fontLineHeight">[]
    | undefined,
): readonly string[] {
  if (!baseline) return warnings;
  const surfaces =
    activeSurfaces && activeSurfaces.length > 0 ? activeSurfaces : [baseline];
  const deferred = [
    ...(surfaces.every(
      (surface) => configuration.fontFamily === surface.fontFamily,
    )
      ? []
      : ["font.family"]),
    ...(surfaces.every(
      (surface) => configuration.fontLineHeight === surface.fontLineHeight,
    )
      ? []
      : ["font.lineHeight"]),
  ];
  if (deferred.length === 0) return warnings;
  const settings =
    deferred.length === 1
      ? deferred[0]!
      : t("notice.and", { first: deferred[0]!, second: deferred[1]! });
  return [
    ...warnings,
    t("notice.restartDeferred", { count: deferred.length, settings }),
  ];
}

// The validator's detail stays English; the surrounding notice is translated.
function boundedReloadNotice(
  { t }: Translator,
  fallback: UserConfigurationFallback | undefined,
): string {
  const frame = t("notice.reloadFailed", { detail: "{detail}" });
  const detail = fallback
    ? fallback.error.message.replace(" Fix the file and restart OMXTerm.", "")
    : t("notice.reloadUnexpected");
  const available =
    MAX_USER_FILE_ERROR_LENGTH - frame.length + "{detail}".length;
  // A replacer function keeps `$` sequences in the detail literal.
  return frame.replace("{detail}", () =>
    detail.slice(0, Math.max(0, available)),
  );
}

const MAX_RELOAD_DURATION_MS = 86_400_000;

function elapsedMilliseconds(startedAt: number, endedAt: number): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return 0;
  return Math.min(
    MAX_RELOAD_DURATION_MS,
    Math.max(0, Math.round(endedAt - startedAt)),
  );
}
