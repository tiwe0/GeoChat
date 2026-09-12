/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_ORIGIN?: string;
  readonly VITE_GEOGEBRA_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
