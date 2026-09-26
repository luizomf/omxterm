import { expect, it, vi } from "vitest";
import { prepareLargePasteShell } from "../fixtures/restty-host-paste";

it("requires a fresh raw post-interrupt prompt before encoded execution readiness", async () => {
  let output = "PS C:\\old> ";
  const writes: string[] = [];
  const labels: string[] = [];
  await prepareLargePasteShell(
    {
      output: () => output,
      write(data) {
        writes.push(data);
        output += data;
      },
      async waitFor(predicate, label) {
        labels.push(label);
        expect(predicate()).toBe(false);
        if (labels.length === 1) {
          expect(writes).toEqual(["\u0003"]);
          output += "PS C:\\owned> ";
        } else {
          // The command echo above cannot acknowledge executed readiness.
          output += "__PASTE_SHELL_READY__\r\n";
        }
        expect(predicate()).toBe(true);
      },
    },
    "win32",
  );
  expect(labels).toEqual([
    "owned PowerShell prompt after interrupt",
    "owned PowerShell paste fixture readiness",
  ]);
  expect(writes).toHaveLength(2);
});

it("does not send readiness input when the fresh raw prompt prerequisite fails", async () => {
  const write = vi.fn();
  await expect(
    prepareLargePasteShell(
      {
        output: () => "PS C:\\old> ",
        write,
        async waitFor(predicate) {
          expect(predicate()).toBe(false);
          throw new Error("fresh prompt missing");
        },
      },
      "win32",
    ),
  ).rejects.toThrow("fresh prompt missing");
  expect(write).toHaveBeenCalledExactlyOnceWith("\u0003");
});

it("readiness failure reports the phase, never unknown terminal output", async () => {
  let output = "unknown terminal payload";
  const error = await prepareLargePasteShell(
    {
      output: () => output,
      write() {
        output += "PS C:\\owned> ";
      },
      async waitFor(predicate, label) {
        if (!predicate()) throw new Error(`Timed out waiting for ${label}`);
      },
    },
    "win32",
  ).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe(
    "PowerShell paste fixture produced no readiness marker",
  );
});
