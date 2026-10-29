import { expect, it } from "vitest";
import { extensionPresentation } from "../../src/main/extension-presentation";

it.each(["omxterm.files", "omxterm.ssh"])(
  "places captured %s tool metadata in the panel",
  (id) => {
    expect(
      extensionPresentation({
        id,
        view: {
          entry: "index.html",
          title: "Any localized title",
          action: `${id}.open`,
        },
      }),
    ).toBe("panel");
  },
);

it("keeps general extensions as tabs regardless of their display title", () => {
  expect(
    extensionPresentation({
      id: "example.files",
      view: {
        entry: "index.html",
        title: "Files",
        action: "example.files.open",
      },
    }),
  ).toBeUndefined();
  expect(
    extensionPresentation({
      id: "omxterm.files",
      view: {
        entry: "index.html",
        title: "Files",
        action: "omxterm.files.other",
      },
    }),
  ).toBeUndefined();
  expect(extensionPresentation({ id: "omxterm.ssh" })).toBeUndefined();
});
