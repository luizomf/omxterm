import { ImageAddon } from "@xterm/addon-image";
import { Terminal } from "@xterm/xterm";
import { TERMINAL_IMAGE_ADDON_OPTIONS } from "../../src/terminal-surface/terminal-surface";
import {
  createUncompressedPng,
  kittyChunks,
  kittyTransmission,
} from "./kitty-image-data";

export interface StorageLimitResults {
  readonly belowLimit: boolean;
  readonly fifoEviction: boolean;
  readonly sentinelRetained: boolean;
}

export async function exerciseStorageLimit(
  largeBase64: string,
): Promise<StorageLimitResults> {
  const container = document.createElement("main");
  container.style.width = "900px";
  container.style.height = "560px";
  document.body.append(container);
  const terminal = new Terminal({
    allowProposedApi: true,
    cols: 220,
    rows: 160,
    scrollback: 10_000,
  });
  const addon = new ImageAddon(TERMINAL_IMAGE_ADDON_OPTIONS);
  terminal.loadAddon(addon);
  terminal.open(container);

  try {
    const sentinel = createUncompressedPng(2, 2, 0x6090_0609);
    await writeTerminal(
      terminal,
      `${kittyTransmission(sentinel, { id: 609 })}\r\n`,
    );
    await waitFor(() => addon.storageUsage > 0);
    const sentinelRetained =
      addon.storageUsage < 64 && addon.getImageAtBufferCell(0, 0) !== undefined;

    for (const id of [610, 611, 612])
      await writeChunkedKittyImage(terminal, largeBase64, id);
    await nextFrames(3);
    if (addon.storageUsage <= 48)
      throw new Error(
        `Unexpected storage usage after three images: ${addon.storageUsage}`,
      );
    const belowLimit =
      addon.getImageAtBufferCell(0, 0) !== undefined && addon.storageUsage < 64;

    await writeChunkedKittyImage(terminal, largeBase64, 613);
    await waitFor(() => addon.storageUsage === 64, 60_000);
    return {
      belowLimit,
      fifoEviction: addon.getImageAtBufferCell(0, 0) === undefined,
      sentinelRetained,
    };
  } finally {
    terminal.dispose();
    container.remove();
  }
}

async function writeChunkedKittyImage(
  terminal: Terminal,
  encoded: string,
  id: number,
): Promise<void> {
  let batch = "";
  let count = 0;
  for (const sequence of kittyChunks(encoded, { id })) {
    batch += sequence;
    count += 1;
    if (count % 64 !== 0) continue;
    await writeTerminal(terminal, batch);
    batch = "";
  }
  if (batch.length > 0) await writeTerminal(terminal, batch);
  await writeTerminal(terminal, "\r\n");
}

function writeTerminal(terminal: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => terminal.write(data, resolve));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMilliseconds = 10_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMilliseconds;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for image storage state");
}

async function nextFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1)
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
}
