import type { MessageKey, Translator } from "../../shared/i18n";
import type {
  SavedSessionsDocument,
  SessionDefinition,
  SshAuthentication,
} from "../../shared/saved-sessions";
import { folderPath } from "./session-tree";

// How many panes of one Saved Session are open in this window, and how many
// of them still run. Ended panes are the retained failed ones.
export interface SessionPaneCount {
  readonly open: number;
  readonly running: number;
}

export type SessionStatus = "connected" | "disconnected" | "idle";

// Green while any pane runs, red when every open pane has ended, grey when
// none is open in this window.
export function sessionStatus(count: SessionPaneCount): SessionStatus {
  if (count.running > 0) return "connected";
  return count.open > 0 ? "disconnected" : "idle";
}

const AUTHENTICATION: Readonly<Record<SshAuthentication, MessageKey>> = {
  agent: "sessions.auth.agent",
  key: "sessions.auth.key",
  password: "sessions.auth.password",
};

// user@host:port, the way the Sessions list shows an SSH target.
export function sshTarget(
  session: Extract<SessionDefinition, { kind: "ssh" }>,
): string {
  const user = session.user ? `${session.user}@` : "";
  const port =
    session.port !== undefined && session.port !== 22 ? `:${session.port}` : "";
  return `${user}${session.host}${port}`;
}

// The labelled facts of a definition for tooltips, one per line. Secrets are
// never part of a definition, so none can appear here.
export function sessionDetailLines(
  session: SessionDefinition,
  sessions: SavedSessionsDocument,
  translator: Translator,
): string[] {
  const t = translator.t.bind(translator);
  const line = (key: MessageKey, value: string) => `${t(key)}: ${value}`;
  const lines = [
    line(
      "sessions.field.kind",
      t(session.kind === "ssh" ? "sessions.kind.ssh" : "sessions.kind.local"),
    ),
  ];
  if (session.folderId)
    lines.push(
      line("sessions.field.folder", folderPath(sessions, session.folderId)),
    );
  if (session.kind === "ssh") {
    lines.push(line("sessions.field.host", session.host));
    lines.push(line("sessions.field.port", String(session.port ?? 22)));
    if (session.user) lines.push(line("sessions.field.user", session.user));
    lines.push(
      line("sessions.field.auth", t(AUTHENTICATION[session.authentication])),
    );
    if (session.authentication === "key" && session.identityFile)
      lines.push(line("sessions.field.identityFile", session.identityFile));
    if (session.proxyJump)
      lines.push(line("sessions.field.proxyJump", session.proxyJump));
    const features = [
      session.forwardAgent ? t("sessions.field.forwardAgent") : undefined,
      session.x11 ? t("sessions.field.x11") : undefined,
      session.compression ? t("sessions.field.compression") : undefined,
    ].filter((feature): feature is string => feature !== undefined);
    if (features.length > 0)
      lines.push(line("details.features", features.join(", ")));
    if (session.forwards?.length)
      lines.push(
        line("sessions.field.forwards", String(session.forwards.length)),
      );
    if (session.remoteCommand)
      lines.push(line("sessions.field.remoteCommand", session.remoteCommand));
  } else {
    if (session.workingDirectory)
      lines.push(
        line("sessions.field.workingDirectory", session.workingDirectory),
      );
    if (session.program)
      lines.push(
        line(
          "sessions.field.shell",
          [session.program, ...(session.arguments ?? [])].join(" "),
        ),
      );
  }
  if (session.lastUsedAt !== undefined)
    lines.push(
      line(
        "details.lastUsed",
        translator.formatDate(session.lastUsedAt, {
          dateStyle: "short",
          timeStyle: "short",
        }),
      ),
    );
  const note = session.description?.split("\n")[0]?.trim();
  if (note) lines.push(line("sessions.field.description", note));
  return lines;
}

// "Open in this window: 2 (1 connected, 1 disconnected)", or none.
export function paneCountLine(
  count: SessionPaneCount,
  translator: Translator,
): string {
  const t = translator.t.bind(translator);
  if (count.open === 0) return t("details.openNone");
  return t("details.open", {
    open: count.open,
    running: count.running,
    ended: count.open - count.running,
  });
}

// The tooltip of an SSH tab: what it runs, where it connects and since when.
export function remoteTabTooltip(
  pane: {
    readonly title: string;
    readonly ended: boolean;
    readonly startedAt?: number;
  },
  target: { readonly name?: string; readonly connection: string },
  details: readonly string[],
  translator: Translator,
): string {
  const t = translator.t.bind(translator);
  return [
    target.name
      ? t("details.sshSession", { name: target.name })
      : t("details.quickConnect"),
    `${t("details.title")}: ${pane.title}`,
    `${t("details.connection")}: ${target.connection}`,
    ...details,
    pane.ended
      ? t("details.disconnected")
      : pane.startedAt !== undefined
        ? t("details.connectedSince", {
            time: translator.formatDate(pane.startedAt, { timeStyle: "short" }),
          })
        : t("details.connecting"),
  ].join("\n");
}
