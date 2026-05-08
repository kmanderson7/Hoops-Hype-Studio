/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * When `'true'`, the analysis effect skips all `/.netlify/functions/*`
   * calls and seeds the store from `data/mockData.ts`. Useful for local
   * UI work without Modal/Pixabay credentials. Read in `src/app.tsx`.
   */
  readonly VITE_USE_MOCK_DATA?: string
  /** Optional Tus upload endpoint. When set, UploadStage uses Uppy + Tus. */
  readonly VITE_TUS_ENDPOINT?: string
  /** Public bucket base URL for logo previews if your R2/S3 bucket is public. */
  readonly VITE_PUBLIC_BUCKET_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
