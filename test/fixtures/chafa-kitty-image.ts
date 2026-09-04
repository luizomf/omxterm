import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";
import type { TerminalSurface } from "../../src/terminal-surface/terminal-surface";
import { canvasContainsColor, canvasIsPainted } from "./kitty-image-canvas";
import { bytesToBase64, kittyDelete } from "./kitty-image-data";

const CHAFA_COLOR = [34, 114, 170, 255] as const;
const TINY_RGBA = new Uint8Array([
  ...CHAFA_COLOR,
  ...CHAFA_COLOR,
  ...CHAFA_COLOR,
  ...CHAFA_COLOR,
]);
const TINY_RGBA_BASE64 = bytesToBase64(TINY_RGBA);
const VALID_PRELUDE = "a=T,f=32,s=2,v=2,c=8,r=4,m=1,q=2";

export async function exerciseChafaKittyImages(
  handlers: TerminalSessionHandlers,
  checks: Record<string, boolean>,
): Promise<void> {
  await exerciseStandaloneCompletion(handlers, checks);
  await exerciseInterruptedControlSequences(handlers, checks);
  const prelude = apc(VALID_PRELUDE);
  send(handlers, prelude.slice(0, 9));
  await nextFrames(2);
  send(handlers, prelude.slice(9));
  await nextFrames(2);
  send(handlers, apc(`m=1;${TINY_RGBA_BASE64.slice(0, 8)}`));
  await nextFrames(2);
  send(
    handlers,
    `${apc(`m=0;${TINY_RGBA_BASE64.slice(8)}`)}__CHAFA_COMPLETE__\r\n`,
  );
  await waitFor(
    () =>
      terminalText().includes("__CHAFA_COMPLETE__") &&
      canvasContainsColor(CHAFA_COLOR),
  );
  record(
    checks,
    "Chafa-shaped metadata-first RGBA renders expected pixels",
    true,
  );
  record(checks, "PTY output completes after Chafa image decoding", true);
  send(handlers, kittyDelete("A"));
  await waitFor(() => !canvasIsPainted());

  await expectNoImageAfter(
    handlers,
    checks,
    "Chafa display stays ordered before following Kitty deletion",
    `${apc(VALID_PRELUDE)}${apc(`m=0;${TINY_RGBA_BASE64}`)}${kittyDelete("A")}`,
    "CHAFA_ORDERED_DELETE",
  );
  await expectNoImageAfter(
    handlers,
    checks,
    "completed Chafa transmission releases pending metadata",
    apc(`m=0;${TINY_RGBA_BASE64}`),
    "CHAFA_COMPLETION_RELEASE",
  );
  await expectNoImageAfter(
    handlers,
    checks,
    "malformed Chafa Base64 renders nothing",
    `${apc(VALID_PRELUDE)}${apc("m=1;%%%")}${apc("m=0")}`,
    "CHAFA_MALFORMED",
  );
  await expectNoImageAfter(
    handlers,
    checks,
    "canceled malformed Chafa APC does not swallow later output",
    `${apc(VALID_PRELUDE)}\u001b_Gm=0;%%%\u0018AFTER_CANCEL`,
    "CHAFA_CANCELED",
  );
  await expectNoImageAfter(
    handlers,
    checks,
    "Chafa prelude requires source dimensions",
    `${apc("a=T,f=32,s=2,c=8,r=4,m=1,q=2")}${apc(`m=0;${TINY_RGBA_BASE64}`)}`,
    "CHAFA_MISSING_DIMENSION",
  );
  await expectNoImageAfter(
    handlers,
    checks,
    "Chafa source dimensions must be positive",
    `${apc("a=T,f=32,s=0,v=2,c=8,r=4,m=1,q=2")}${apc(`m=0;${TINY_RGBA_BASE64}`)}`,
    "CHAFA_ZERO_DIMENSION",
  );
  await expectNoImageAfter(
    handlers,
    checks,
    "Chafa source dimensions enforce pixelLimit",
    `${apc("a=T,f=32,s=4097,v=1024,c=8,r=4,m=1,q=2")}${apc(`m=0;${TINY_RGBA_BASE64}`)}`,
    "CHAFA_SOURCE_LIMIT",
  );

  for (const [name, bytes] of [
    ["short", TINY_RGBA.subarray(0, -4)],
    ["long", new Uint8Array([...TINY_RGBA, 1, 2, 3, 4])],
  ] as const) {
    await expectNoImageAfter(
      handlers,
      checks,
      `Chafa ${name} decoded length renders nothing`,
      `${apc(VALID_PRELUDE)}${apc(`m=1;${bytesToBase64(bytes)}`)}${apc("m=0")}`,
      `CHAFA_LENGTH_${name.toUpperCase()}`,
    );
  }

  send(
    handlers,
    `${apc("a=T,f=32,s=1,v=1,c=1,r=1,m=1,q=2")}${apc("m=1;AAAA")}${apc(`${VALID_PRELUDE},t=d`)}${apc(`m=0;${TINY_RGBA_BASE64}`)}__CHAFA_REPLACED__\r\n`,
  );
  await waitFor(
    () =>
      terminalText().includes("__CHAFA_REPLACED__") &&
      canvasContainsColor(CHAFA_COLOR),
  );
  record(
    checks,
    "new explicit-direct Chafa prelude replaces the anonymous pending transmission",
    true,
  );
  send(handlers, kittyDelete("A"));
  await waitFor(() => !canvasIsPainted());

  send(
    handlers,
    `${apc(VALID_PRELUDE)}${apc(`m=1;${TINY_RGBA_BASE64.slice(0, 8)}`)}__CHAFA_INCOMPLETE__\r\n`,
  );
  await waitFor(() => terminalText().includes("__CHAFA_INCOMPLETE__"));
  record(
    checks,
    "incomplete Chafa transmission does not block terminal output",
    !canvasIsPainted(),
  );
  await expectNoImageAfter(
    handlers,
    checks,
    "terminal reset releases pending Chafa metadata",
    `\u001bc${apc(`m=0;${TINY_RGBA_BASE64.slice(8)}`)}`,
    "CHAFA_RESET_RELEASE",
  );
  await expectNoImageAfter(
    handlers,
    checks,
    "leaving the alternate buffer releases pending Chafa metadata",
    `\u001b[?1049h${apc(VALID_PRELUDE)}${apc(`m=1;${TINY_RGBA_BASE64.slice(0, 8)}`)}\u001b[?1049l${apc(`m=0;${TINY_RGBA_BASE64.slice(8)}`)}`,
    "CHAFA_ALT_RELEASE",
  );
}

async function exerciseStandaloneCompletion(
  handlers: TerminalSessionHandlers,
  checks: Record<string, boolean>,
): Promise<void> {
  // Chafa 1.18.2, generated solid pixels, fresh 80x24 PTY (800x480 px),
  // -f kitty -s 1x1: four APCs, 680 + 388 Base64 characters, then no ';'.
  const pixels = new Uint8Array(10 * 20 * 4);
  for (let offset = 0; offset < pixels.length; offset += 4)
    pixels.set(CHAFA_COLOR, offset);
  const encoded = bytesToBase64(pixels);
  const transmission =
    apc("a=T,f=32,s=10,v=20,c=1,r=1,m=1,q=2") +
    apc(`m=1;${encoded.slice(0, 680)}`) +
    apc(`m=1;${encoded.slice(680)}`) +
    apc("m=0");
  for (const fragmented of [false, true]) {
    if (fragmented) {
      for (let offset = 0; offset < transmission.length; offset += 7) {
        send(handlers, transmission.slice(offset, offset + 7));
        await nextFrames(1);
      }
    } else send(handlers, transmission);
    send(handlers, "__CHAFA_STANDALONE__\r\n");
    await waitFor(
      () =>
        terminalText().includes("__CHAFA_STANDALONE__") &&
        canvasContainsColor(CHAFA_COLOR),
    );
    record(
      checks,
      `standalone Chafa completion paints with fragmented transport ${fragmented}`,
      true,
    );
    send(handlers, kittyDelete("A"));
    await waitFor(() => !canvasIsPainted());
    await expectNoImageAfter(
      handlers,
      checks,
      `standalone completion releases pending state with fragmented transport ${fragmented}`,
      apc("m=0"),
      "CHAFA_STANDALONE_RELEASE",
    );
  }
  await expectNoImageAfter(
    handlers,
    checks,
    "standalone Chafa completion stays ordered before deletion",
    transmission + kittyDelete("A"),
    "CHAFA_STANDALONE_ORDER",
  );
}

async function exerciseInterruptedControlSequences(
  handlers: TerminalSessionHandlers,
  checks: Record<string, boolean>,
): Promise<void> {
  for (const [name, control] of [
    ["OSC", "\u001b]2;unfinished"],
    ["CSI", "\u001b[31"],
  ] as const) {
    for (const split of [false, true]) {
      const sequence = `${control}${apc(VALID_PRELUDE)}`;
      if (split) {
        send(handlers, sequence.slice(0, -2));
        await nextFrames(2);
        send(handlers, sequence.slice(-2));
      } else send(handlers, sequence);
      await expectNoImageAfter(
        handlers,
        checks,
        `Chafa prelude interrupts unfinished ${name} with split transport ${split}`,
        "",
        `CHAFA_INTERRUPTED_${name}_${split}`,
      );
    }
  }
  send(handlers, "\u001bc");
}

export async function disposePendingChafaImage(
  surface: TerminalSurface,
  handlers: TerminalSessionHandlers,
  checks: Record<string, boolean>,
): Promise<void> {
  send(handlers, kittyDelete("A"));
  await waitFor(() => !canvasIsPainted());
  send(
    handlers,
    `${apc(VALID_PRELUDE)}${apc("m=1;AAAA")}__CHAFA_DISPOSAL_PENDING__\r\n`,
  );
  await waitFor(() => terminalText().includes("__CHAFA_DISPOSAL_PENDING__"));
  surface.dispose();
  await nextFrames(2);
  record(
    checks,
    "tab disposal releases pending Chafa metadata and removes image canvas",
    !document.querySelector(".xterm-image-layer-top"),
  );
}

async function expectNoImageAfter(
  handlers: TerminalSessionHandlers,
  checks: Record<string, boolean>,
  check: string,
  sequences: string,
  marker: string,
): Promise<void> {
  send(handlers, `${sequences}__${marker}__\r\n`);
  await waitFor(() => terminalText().includes(`__${marker}__`));
  await nextFrames(3);
  record(checks, check, !canvasIsPainted());
}

function apc(data: string): string {
  return `\u001b_G${data}\u001b\\`;
}

function send(handlers: TerminalSessionHandlers, data: string): void {
  handlers.onOutput(data);
}

function terminalText(): string {
  return document.querySelector(".xterm-rows")?.textContent ?? "";
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
  throw new Error(
    `Timed out waiting for Chafa fixture state: ${terminalText()}`,
  );
}

async function nextFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1)
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
}

function record(
  checks: Record<string, boolean>,
  name: string,
  result: boolean,
): void {
  checks[name] = result;
  if (!result) throw new Error(`Chafa Kitty image check failed: ${name}`);
}
