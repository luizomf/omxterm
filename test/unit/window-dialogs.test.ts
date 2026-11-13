import { expect, it } from "vitest";
import { trackWindowDialogs } from "../../src/main/window-dialogs";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

it("knows which window has a native dialog open until each one settles", async () => {
  const pending: Array<ReturnType<typeof deferred>> = [];
  const open = (..._args: unknown[]) => {
    const next = deferred();
    pending.push(next);
    return next.promise;
  };
  const dialog = {
    showMessageBox: open,
    showOpenDialog: open,
    showSaveDialog: async (..._args: unknown[]) => {
      throw new Error("refused");
    },
  };
  const { hasOpenDialog } = trackWindowDialogs(dialog);
  const window = {};
  const other = {};

  const confirm = dialog.showMessageBox(window, {});
  const choose = dialog.showOpenDialog(window, {});
  // A dialog without a window belongs to none.
  void dialog.showMessageBox({});
  expect(hasOpenDialog(window)).toBe(true);
  expect(hasOpenDialog(other)).toBe(false);

  pending[0]!.resolve();
  await confirm;
  expect(hasOpenDialog(window)).toBe(true);
  pending[1]!.resolve();
  await choose;
  expect(hasOpenDialog(window)).toBe(false);

  // A dialog that fails still stops counting.
  await expect(dialog.showSaveDialog(window, {})).rejects.toThrow("refused");
  expect(hasOpenDialog(window)).toBe(false);
});
