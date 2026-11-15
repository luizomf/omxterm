import { describe, expect, it, vi } from "vitest";
import { resttyClipboardActions } from "../../src/terminal-surface/restty-host-services";
import type { SemanticInputDelivery } from "../../src/terminal-surface/semantic-input-delivery";

function actions(output: string | undefined) {
  const writeText = vi.fn(async (_text: string) => undefined);
  const onClipboardError = vi.fn();
  const interaction =
    output === undefined
      ? undefined
      : {
          getSelectionText: () => "selected",
          getBufferText: () => "",
          getScreenText: () => "",
          getLastCommandOutput: () => output,
          selectAll: () => true,
        };
  const surface = resttyClipboardActions(
    {} as SemanticInputDelivery,
    {
      clipboard: {
        writeText,
        readText: async () => "",
        confirmPaste: async () => false,
        requestContextMenu: () => undefined,
      },
      onClipboardError,
    },
    () => interaction,
  );
  return { surface, writeText, onClipboardError };
}

describe("Copy Last Command Output on the Surface", () => {
  it("copies the last command's output, not the selection", async () => {
    const { surface, writeText } = actions("a.txt\nb.txt");
    await surface.copyLastCommandOutput!();
    expect(writeText).toHaveBeenCalledExactlyOnceWith("a.txt\nb.txt");
  });

  it("leaves the clipboard alone without output or a live terminal", async () => {
    for (const output of ["", undefined]) {
      const { surface, writeText, onClipboardError } = actions(output);
      await surface.copyLastCommandOutput!();
      expect(writeText).not.toHaveBeenCalled();
      expect(onClipboardError).not.toHaveBeenCalled();
    }
  });

  it("reports a clipboard failure", async () => {
    const { surface, writeText, onClipboardError } = actions("out");
    writeText.mockRejectedValueOnce(new Error("denied"));
    await surface.copyLastCommandOutput!();
    expect(onClipboardError).toHaveBeenCalledOnce();
  });
});
