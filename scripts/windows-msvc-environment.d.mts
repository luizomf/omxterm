export const missingBuildToolsMessage: string;
export function parseEnvironmentDump(text: string): Record<string, string>;
export function resolveMsvcEnvironment(
  arch?: string,
): Record<string, string | undefined> | null;
