export const defaultSnippets: {
  id: string;
  version: string;
  filename: string;
  bytes: number;
  sha256: string;
  sourceCommit: string;
  url: string;
  targets: string[];
};
export function readDefaultSnippets(file: string | URL): Promise<Buffer>;
export function prepareDefaultSnippets(
  archive: string | URL,
  project?: string,
): Promise<void>;
export function stageDefaultSnippets(
  project: string,
  target: string,
): Promise<string>;
export function verifyDefaultSnippetsResources(
  resources: string,
  target: string,
): Promise<void>;
export default function preparePackageInputs(context: {
  electronPlatformName: string;
  arch: number;
  packager: { projectDir: string };
}): Promise<void>;
