export const backupIpc = {
  create: "backup:create",
  choose: "backup:choose",
  restore: "backup:restore",
  // Main asks the focused window to start a flow: "create" or "restore".
  request: "backup:request",
} as const;

export type BackupRequest = "create" | "restore";

export function isBackupRequest(value: unknown): value is BackupRequest {
  return value === "create" || value === "restore";
}
