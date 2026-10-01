import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";

// Custom Surface/host mains bypass production startup. Select the supported
// Linux backend before Electron bootstrap, not through a late appendSwitch.
// About/production relaunch fixtures deliberately do not use this policy.
export function supportedFixtureChromiumArguments(
  platform: NodeJS.Platform = process.platform,
): string[] {
  const args: string[] = [];
  applyChromiumSandboxPolicy(
    { appendSwitch: (name) => args.push(`--${name}`) },
    platform,
  );
  if (platform === "linux") args.push("--ozone-platform=x11");
  return args;
}
