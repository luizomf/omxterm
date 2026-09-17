declare module "*.css";
declare module "*.ttf" {
  const bytes: Uint8Array;
  export default bytes;
}
