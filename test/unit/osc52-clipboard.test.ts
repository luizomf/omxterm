import { describe, expect, it, vi } from "vitest";
import {
  decodeOsc52Write,
  registerOsc52Clipboard,
  XTERM_OSC_PAYLOAD_LIMIT,
} from "../../src/terminal-surface/osc52-clipboard";

describe("write-only OSC 52 clipboard", () => {
  it.each([
    ["c;77u/", "\uFEFF"],
    ["c;77u/YQ==", "\uFEFFa"],
  ])("preserves a leading UTF-8 BOM in valid write %j", (data, text) => {
    expect(decodeOsc52Write(data)).toBe(text);
  });

  it.each(["c;?", "c;", "c;%%%", "c;8A==", "c;AB==", "p;aGVsbG8=", "c;===="])(
    "refuses read, clear, malformed UTF-8, target, or Base64 request %j",
    (data) => expect(decodeOsc52Write(data)).toBeUndefined(),
  );

  it("uses the pinned @xterm/xterm parser bound without a 64 KiB project limit", () => {
    const largestValidEncodedLength =
      Math.floor((XTERM_OSC_PAYLOAD_LIMIT - 2) / 4) * 4;
    const immediatelyInside = `c;${"A".repeat(largestValidEncodedLength)}`;
    const immediatelyOutside = `c;${"A".repeat(largestValidEncodedLength + 4)}`;

    expect(immediatelyInside.length).toBeLessThanOrEqual(
      XTERM_OSC_PAYLOAD_LIMIT,
    );
    expect(decodeOsc52Write(immediatelyInside)?.length).toBe(
      (largestValidEncodedLength / 4) * 3,
    );
    expect(immediatelyOutside.length).toBeGreaterThan(XTERM_OSC_PAYLOAD_LIMIT);
    expect(decodeOsc52Write(immediatelyOutside)).toBeUndefined();
  });

  it("consumes every OSC 52 form and writes only valid nonempty UTF-8", async () => {
    let handler: ((data: string) => boolean | Promise<boolean>) | undefined;
    const writeText = vi.fn(async () => undefined);
    const parser = {
      registerOscHandler: vi.fn(
        (
          _ident: number,
          value: (data: string) => boolean | Promise<boolean>,
        ) => {
          handler = value;
          return { dispose: vi.fn() };
        },
      ),
    };
    registerOsc52Clipboard(parser, writeText);

    expect(await handler!("c;aGVsbG8g8J+Zgg==")).toBe(true);
    expect(await handler!("c;?")).toBe(true);
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith("hello 🙂");
  });
});
