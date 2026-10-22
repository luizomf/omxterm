export const sessionIpc = {
  list: "sessions:list",
  saveSession: "sessions:save-session",
  deleteSession: "sessions:delete-session",
  saveFolder: "sessions:save-folder",
  deleteFolder: "sessions:delete-folder",
  importSshConfig: "sessions:import-ssh-config",
  importFile: "sessions:import-file",
  exportFile: "sessions:export-file",
  chooseFile: "sessions:choose-file",
  changed: "sessions:changed",
  toggleSidebar: "sessions:toggle-sidebar",
} as const;

export type SessionFileChoice = "identity-file" | "directory" | "program";

export function isSessionFileChoice(
  value: unknown,
): value is SessionFileChoice {
  return (
    value === "identity-file" || value === "directory" || value === "program"
  );
}
