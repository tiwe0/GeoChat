import type { GeoChatDesktopApi } from "../../shared/desktop-api";

declare module "*.png" {
  const src: string;
  export default src;
}

declare global {
  interface Window {
    geochatDesktop?: GeoChatDesktopApi;
  }

  interface ImportMetaEnv {
    readonly VITE_GEOCHAT_APP_VERSION?: string;
    readonly VITE_GEOCHAT_BACKEND_BASE_URL?: string;
    readonly VITE_GEOCHAT_BACKEND_URL?: string;
    readonly VITE_GEOCHAT_MODEL_REGISTRY_API_BASE_URL?: string;
    readonly VITE_GEOCHAT_PROBLEM_BANK_API_BASE_URL?: string;
    readonly VITE_GEOCHAT_PROBLEM_BANK_CACHE_BYTES?: string;
  }
}
