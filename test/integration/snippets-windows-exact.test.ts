import { it } from "vitest";
import { windowsExactInputs } from "../fixtures/snippets-windows-exact-inputs";
import { runWindowsExactCampaign } from "../fixtures/snippets-windows-exact-campaign";

const values = windowsExactInputs();
it.skipIf(!values)(
  values?.probe
    ? "probes packaged Windows early arm and readiness without qualification"
    : "qualifies installed Snippets on the exact staged Windows ARM64 executable",
  { timeout: 150000 },
  (testContext) => runWindowsExactCampaign(values!, testContext),
);
