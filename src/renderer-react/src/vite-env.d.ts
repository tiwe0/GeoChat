/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_ORIGIN?: string;
  readonly VITE_GEOGEBRA_VERSION?: string;
  readonly VITE_PRODUCT_MARKET?: "global" | "cn";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
