export type FixtureWindowPolicy = "standard" | "hyprland-suppress-maximize";

// An operator declaration, established from the active compositor rules before
// testing, never a fallback inferred from a failed maximize assertion.
export function fixtureWindowPolicy(
  environment: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
): FixtureWindowPolicy {
  const policy = environment.OMXTERM_TEST_WINDOW_POLICY ?? "standard";
  if (policy === "standard") return policy;
  if (
    policy === "hyprland-suppress-maximize" &&
    platform === "linux" &&
    environment.HYPRLAND_INSTANCE_SIGNATURE
  )
    return policy;
  throw new Error(
    "Invalid native fixture window policy or missing Hyprland session",
  );
}
