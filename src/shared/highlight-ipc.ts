export const highlightIpc = {
  get: "highlights:get",
  save: "highlights:save",
  changed: "highlights:changed",
  // Main asks the focused window to open the rule editor.
  openEditor: "highlights:open-editor",
} as const;
