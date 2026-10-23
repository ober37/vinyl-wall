// The page's version, from the repo's VERSION file at build time (also written into <meta name="vinyl-wall-version">,
// which release.yml checks). The update notice compares it with the latest release.
declare const __APP_VERSION__: string
export const APP_VERSION = __APP_VERSION__
