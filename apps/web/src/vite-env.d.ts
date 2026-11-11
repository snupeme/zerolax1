/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_ADMIN_DEFAULT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
