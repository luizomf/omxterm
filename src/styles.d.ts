declare module "*.css";
declare module "*.ttf" {
  const bytes: Uint8Array;
  export default bytes;
}
declare module "*.md" {
  const text: string;
  export default text;
}
