import { expect, it, vi } from "vitest";
import { createSemanticInputDelivery } from "../../src/terminal-surface/semantic-input-delivery";

function fixture() {
  let bracketed = true;
  const write = vi.fn();
  const onFailure = vi.fn();
  const confirmPaste = vi.fn(async (_text: string) => true);
  const delivery = createSemanticInputDelivery({
    isLive: () => true,
    isBracketedPasteEnabled: () => bracketed,
    write,
    onFailure,
    confirmPaste,
    chunkBytes: 8,
  });
  return {
    delivery,
    write,
    onFailure,
    confirmPaste,
    mode: (value: boolean) => {
      bracketed = value;
    },
  };
}

it("rejects the complete loaded paste before even a safe prefix, then accepts the next request", async () => {
  const f = fixture();
  const refused = f.delivery.deliverFrom(
    async () => `${"safe".repeat(100)}\u001b[201~tail`,
    { submit: true },
  );
  expect(await refused).toBe(false);
  expect(f.write).not.toHaveBeenCalled();
  expect(f.onFailure).toHaveBeenCalledOnce();
  expect(f.confirmPaste).not.toHaveBeenCalled();
  expect(await f.delivery.deliver("ok", { submit: true })).toBe(true);
  expect(f.write.mock.calls.flat().join("")).toBe("\u001b[200~ok\u001b[201~\r");
});

it("refuses framing if confirmation changes the receiving mode to bracketed", async () => {
  const f = fixture();
  f.mode(false);
  const text = "before\u001b[201~after";
  f.confirmPaste.mockImplementation(async () => {
    f.mode(true);
    return true;
  });
  expect(await f.delivery.deliver(text, { submit: true })).toBe(false);
  expect(f.confirmPaste).toHaveBeenCalledWith(text);
  expect(f.write).not.toHaveBeenCalled();
  expect(f.onFailure).toHaveBeenCalledOnce();
});

it("preserves explicit non-bracketed confirmation and literal controls", async () => {
  const f = fixture();
  f.mode(false);
  const text = "before\u001b[201~after\u0000\n";
  expect(await f.delivery.deliver(text, { submit: true })).toBe(true);
  expect(f.confirmPaste).toHaveBeenCalledWith(text);
  expect(f.write.mock.calls.flat().join("")).toBe(`${text}\r`);
  expect(f.onFailure).not.toHaveBeenCalled();
});

it("keeps cancellation a quiet no-op", async () => {
  const f = fixture();
  f.mode(false);
  f.confirmPaste.mockResolvedValue(false);
  expect(await f.delivery.deliver("line\n", { submit: true })).toBe(false);
  expect(f.write).not.toHaveBeenCalled();
  expect(f.onFailure).not.toHaveBeenCalled();
});

it("preserves ordinary bracketed text and unrelated controls without confirmation", async () => {
  const f = fixture();
  expect(await f.delivery.deliver("one\n\u0000\u0003two")).toBe(true);
  expect(f.write.mock.calls.flat().join("")).toBe(
    "\u001b[200~one\n\u0000\u0003two\u001b[201~",
  );
  expect(f.confirmPaste).not.toHaveBeenCalled();
  expect(f.onFailure).not.toHaveBeenCalled();
});

it("decides framing from the live mode when a queued request executes", async () => {
  const f = fixture();
  let finish!: (value: string) => void;
  const first = f.delivery.deliverFrom(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const second = f.delivery.deliver("before\u001b[201~after");
  await Promise.resolve();
  f.mode(false);
  finish("first");
  expect(await first).toBe(true);
  expect(await second).toBe(true);
  expect(f.write.mock.calls.flat().join("")).toBe(
    "firstbefore\u001b[201~after",
  );
  expect(f.onFailure).not.toHaveBeenCalled();
});
