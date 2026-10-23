import type { Translator } from "../../shared/i18n";
import type { SessionDefinition } from "../../shared/saved-sessions";
import type { PaneLaunch } from "../terminal-tabs";

export function sessionLaunch(session: SessionDefinition): PaneLaunch {
  return {
    spec: { kind: "saved-session", id: session.id },
    label: session.name,
    ...(session.color ? { color: session.color } : {}),
    // A failed connection or program keeps its screen with Reconnect.
    retainOnExit: true,
  };
}

export function failure(t: Translator["t"], cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  // Electron prefixes remote errors with the channel; keep the reason only.
  const reason = raw.replace(
    /^Error invoking remote method '[^']+': (?:\w*Error: )?/u,
    "",
  );
  return t("sessions.operationFailed", { reason });
}
