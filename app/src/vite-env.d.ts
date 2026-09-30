/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the scene packs are served from, when not from the site itself: a base joined with each pack's `file`. */
  readonly VITE_PACKS_URL?: string;
}
