import assert from "node:assert/strict";

// One native child owns startup input until its execution-only marker arrives.
// Keep only a possible marker suffix, not a transcript of native output.
export function createFixtureSessionInput(readyMarker: string) {
  assert.ok(readyMarker.length > 0);
  let tail = "";
  let ready = false;
  let closed = false;
  let capture: ((data: string) => void) | undefined;
  const assertLive = () =>
    assert.ok(!closed, "Fixture session input owner lost");
  return {
    observeOutput(data: string) {
      if (closed || ready) return;
      const combined = tail + data;
      ready = combined.includes(readyMarker);
      tail = ready
        ? ""
        : combined.slice(Math.max(0, combined.length - readyMarker.length + 1));
    },
    isReady() {
      assertLive();
      return ready;
    },
    capture(listener: (data: string) => void) {
      assertLive();
      assert.ok(ready, "Native fixture child is not ready for input capture");
      assert.ok(!capture, "Fixture session input already captured");
      capture = listener;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        capture = undefined;
      };
    },
    write(data: string, forward: (data: string) => void) {
      assertLive();
      if (capture) capture(data);
      else forward(data);
    },
    dispose() {
      closed = true;
      tail = "";
      capture = undefined;
    },
  };
}

// The caller supplies input/output from ONE core. Old replies cannot satisfy a
// new request; every fresh byte must be part of this exact setup receipt. This
// never filters the subsequent keyboard/nonleak sample.
export async function expectFixtureInputReply(options: {
  readonly input: () => string;
  readonly output: (data: string) => void;
  readonly request: string;
  readonly reply: string;
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
  readonly label: string;
}) {
  const start = options.input().length;
  options.output(options.request);
  await options.waitFor(() => {
    const received = options.input().slice(start);
    assert.ok(
      options.reply.startsWith(received),
      `Unexpected input during ${options.label}`,
    );
    return received === options.reply;
  }, options.label);
  assert.equal(options.input().slice(start), options.reply, options.label);
}
