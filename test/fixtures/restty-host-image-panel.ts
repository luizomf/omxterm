import { createCompanionContent as createProductionCompanionContent } from "../../src/renderer/companion-content";

const fixtureId = "restty-image-geometry-fixture";

type FixtureWindow = Window & {
  __resttyImageGeometryPanel?: { show(): void; close(): void };
};

// Fixture-only wrapper around the window host's production companion seam.
// The registered view contributes no behavior beyond occupying the real panel.
export function createCompanionContent(
  ...args: Parameters<typeof createProductionCompanionContent>
): ReturnType<typeof createProductionCompanionContent> {
  const companion = createProductionCompanionContent(...args);
  const panel = companion.panel;
  const root = args[1];
  if (!panel || !root) return companion;
  const page = root.ownerDocument.defaultView as FixtureWindow;
  if (page.__resttyImageGeometryPanel)
    throw new Error("Image geometry panel fixture already installed");
  let registered = false;
  const fixture = {
    show() {
      if (!registered) {
        panel.register({
          id: fixtureId,
          label: "Image geometry fixture",
          create() {
            const element = root.ownerDocument.createElement("div");
            element.dataset.resttyImageGeometryFixture = "";
            return {
              element,
              activate() {},
              deactivate() {},
              focus() {},
              dispose() {},
            };
          },
        });
        registered = true;
      }
      panel.show(fixtureId);
    },
    close() {
      if (panel.selected() === fixtureId) panel.toggle(fixtureId);
      else if (panel.requested() === fixtureId) panel.dismiss();
    },
  };
  page.__resttyImageGeometryPanel = fixture;
  return {
    ...companion,
    dispose() {
      if (page.__resttyImageGeometryPanel === fixture)
        delete page.__resttyImageGeometryPanel;
      companion.dispose();
    },
  };
}
