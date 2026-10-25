import { sessionIpc, isSessionPasswordChange } from "../shared/session-ipc";
import type { SessionPasswordState } from "../shared/session-ipc";
import type { SavedSessionsDocument } from "../shared/saved-sessions";
import { isSavedSessionId } from "../shared/terminal-launch";
import type { CredentialStore } from "./credential-store";
import type { SshAskpass } from "./ssh-askpass";
import type { IpcEvent, IpcMainPort } from "./terminal-ipc-types";
import { registerTrustedHandlers } from "./trusted-ipc";

// Stored SSH passwords of Saved Sessions, keyed "session:<id>" in the shared
// Credential Store. A synchronous cache of which sessions have one lets a
// launch add the askpass environment without waiting for the keyring.
export interface SessionPasswords {
  state(sessionId: string | undefined): Promise<SessionPasswordState>;
  set(sessionId: string, password: string): Promise<void>;
  clear(sessionId: string): Promise<void>;
  // The askpass environment for a session with a stored password.
  environment(sessionId: string): Readonly<Record<string, string>> | undefined;
  // Removes passwords of sessions that were deleted or no longer use one.
  reconcile(document: SavedSessionsDocument): Promise<void>;
}

const credentialId = (sessionId: string) => `session:${sessionId}`;

export async function createSessionPasswords(
  credentials: CredentialStore,
  askpass: SshAskpass | undefined,
): Promise<SessionPasswords> {
  const saved = new Set(
    (await credentials.ids().catch(() => []))
      .filter((id) => id.startsWith("session:"))
      .map((id) => id.slice("session:".length)),
  );
  const passwords: SessionPasswords = {
    async state(sessionId) {
      return {
        storage: !askpass
          ? "unsupported"
          : credentials.availability().available
            ? "available"
            : "unavailable",
        saved: sessionId !== undefined && saved.has(sessionId),
      };
    },
    async set(sessionId, password) {
      if (!askpass)
        throw new Error("Saving a password is not supported on this system");
      await credentials.set(credentialId(sessionId), password);
      saved.add(sessionId);
    },
    async clear(sessionId) {
      await credentials.delete(credentialId(sessionId));
      saved.delete(sessionId);
    },
    environment(sessionId) {
      return askpass && saved.has(sessionId)
        ? askpass.environment(credentialId(sessionId))
        : undefined;
    },
    async reconcile(document) {
      const usable = new Set(
        document.sessions
          .filter(
            (session) =>
              session.kind === "ssh" && session.authentication === "password",
          )
          .map((session) => session.id),
      );
      for (const sessionId of [...saved])
        if (!usable.has(sessionId))
          await passwords.clear(sessionId).catch(() => {});
    },
  };
  return passwords;
}

// The renderer may ask whether a session has a stored password and store or
// remove one; it can never read a stored password back. Failures cross as a
// short fixed reason, never with the secret or a keyring detail.
export function registerSessionPasswordIpc(
  ipcMain: IpcMainPort,
  isTrusted: (event: IpcEvent) => boolean,
  passwords: SessionPasswords,
  sessions: () => SavedSessionsDocument,
  onRejected?: () => void,
): () => void {
  return registerTrustedHandlers(
    ipcMain,
    isTrusted,
    {
      [sessionIpc.passwordState]: (_event, payload) => {
        if (payload === null) return passwords.state(undefined);
        if (!isSavedSessionId(payload)) throw new Error("Invalid identifier");
        return passwords.state(payload);
      },
      [sessionIpc.setPassword]: async (_event, payload) => {
        if (!isSessionPasswordChange(payload))
          throw new Error("Invalid password change");
        if (payload.password === null) {
          await passwords.clear(payload.id);
          return;
        }
        const session = sessions().sessions.find(
          (candidate) => candidate.id === payload.id,
        );
        if (session?.kind !== "ssh" || session.authentication !== "password")
          throw new Error("The session does not use a password");
        try {
          await passwords.set(payload.id, payload.password);
        } catch {
          throw new Error("The password could not be stored");
        }
      },
    },
    onRejected,
  );
}
