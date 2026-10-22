// Native suites run on every 64-bit architecture OMXTerm builds for. A host
// outside this list skips them rather than claiming evidence it cannot give.
export const NATIVE_TEST_ARCHITECTURES: readonly string[] = ["arm64", "x64"];

export const isNativeTestArchitecture = (arch: string = process.arch) =>
  NATIVE_TEST_ARCHITECTURES.includes(arch);
