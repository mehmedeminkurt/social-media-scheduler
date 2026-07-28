// lint-staged.config.js
// Using function syntax to prevent lint-staged from passing file arguments to tsc.
// When individual files are passed to `tsc`, it ignores tsconfig.json (including esModuleInterop etc.)
// So we return a command string that ignores the file list entirely.

export default {
  "apps/frontend/**/*.{js,ts,tsx}": [
    "npm run lint --workspace=apps/frontend",
    () => "npm run check-types --workspace=apps/frontend",
  ],
};
