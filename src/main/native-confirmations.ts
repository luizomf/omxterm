import { dialog, type BrowserWindow } from "electron";

// Close Window and Close Tab share one native question with Cancel as default.
export async function confirmClose(
  window: BrowserWindow,
  title: string,
  [message, detail]: readonly [string, string],
): Promise<boolean> {
  const result = await dialog.showMessageBox(window, {
    type: "question",
    title,
    message,
    detail,
    buttons: ["Close", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  return result.response === 0;
}
