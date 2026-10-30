// One platform policy for composition and fresh configuration kits. Runtime or
// installation failures never resurrect a competing built-in implementation.
export function usesOptionalSnippets(
  platform: string,
  architecture: string,
): boolean {
  return platform === "linux" && architecture === "arm64";
}
