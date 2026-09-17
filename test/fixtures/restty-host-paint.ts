import type { BrowserWindow } from "electron";

export async function captureResttyFontPaintEvidence(
  window: BrowserWindow,
  deliverOutput: (data: string) => void,
): Promise<{
  readonly blank: number;
  readonly configured: number;
  readonly cjk: number;
  readonly emojiAndSymbol: number;
}> {
  const canvasBounds = (await window.webContents.executeJavaScript(
    "(() => { const bounds = document.querySelector('.restty-terminal-surface canvas')?.getBoundingClientRect(); return bounds ? { x: Math.floor(bounds.x), y: Math.floor(bounds.y), width: Math.floor(bounds.width), height: Math.floor(bounds.height) } : null })()",
    true,
  )) as { x: number; y: number; width: number; height: number } | null;
  if (!canvasBounds) throw new Error("Restty canvas bounds are unavailable");
  const paintedPixels = async () => {
    const bitmap = (
      await window.webContents.capturePage(canvasBounds)
    ).toBitmap();
    let painted = 0;
    for (let offset = 0; offset < bitmap.length; offset += 4)
      if (
        bitmap[offset] !== 0 ||
        bitmap[offset + 1] !== 0 ||
        bitmap[offset + 2] !== 0
      )
        painted += 1;
    return painted;
  };
  const paint = async (text: string, previous?: number) => {
    deliverOutput(text);
    await window.webContents.executeJavaScript(
      "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      true,
    );
    const deadline = Date.now() + 2_000;
    let current = await paintedPixels();
    while (
      previous !== undefined &&
      current === previous &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      current = await paintedPixels();
    }
    return current;
  };

  const blank = await paint("\u001b[2J\u001b[H\u001b[?25l");
  const configured = await paint("WWW", blank);
  const cjk = await paint("\r\n漢", configured);
  const emojiAndSymbol = await paint("\r\n🙂⌘", cjk);
  return { blank, configured, cjk, emojiAndSymbol };
}
