// MUI v9 publishes per-icon ESM files through a wildcard export, but a few
// icons do not expose a declaration that TypeScript 7 can resolve through
// that export map. Keep the import surface typed until the package metadata
// is fixed upstream.
declare module "@mui/icons-material/*" {
  const Icon: import("react").ComponentType<any>;
  export default Icon;
}
