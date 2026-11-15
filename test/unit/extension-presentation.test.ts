import { expect, it } from "vitest";
import {
  companionToolIcon,
  extensionPresentation,
} from "../../src/main/extension-presentation";

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

it("floats Mirror Typing setup as a dialog over the tab", () => {
  expect(
    extensionPresentation({
      id: "omxterm.mirror-typing",
      view: {
        entry: "index.html",
        title: "Mirror Typing",
        action: "omxterm.mirror-typing.open",
      },
    }),
  ).toBe("dialog");
  expect(
    extensionPresentation({
      id: "example.mirror-typing",
      view: {
        entry: "index.html",
        title: "Mirror Typing",
        action: "example.mirror-typing.open",
      },
    }),
  ).toBeUndefined();
});

it("gives each official panel tool its switcher icon, and no other view one", () => {
  const manifest = (id: string, title = "Tool") => ({
    id,
    view: { entry: "index.html", title, action: `${id}.open` },
  });
  expect(companionToolIcon(manifest("omxterm.files"))).toBe("folder");
  expect(companionToolIcon(manifest("omxterm.snippets"))).toBe("code");
  expect(companionToolIcon(manifest("omxterm.ssh"))).toBe("server");
  expect(companionToolIcon(manifest("omxterm.mirror-typing"))).toBeUndefined();
  expect(companionToolIcon(manifest("example.files", "Files"))).toBeUndefined();
});
