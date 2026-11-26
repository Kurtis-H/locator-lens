import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "coverage/", "playwright-report/", "test-results/"] },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: { globals: { ...globals.browser, ...globals.webextensions } },
  },
  {
    files: ["src/locators.js", "src/content.js"],
    languageOptions: { sourceType: "script" },
  },
  {
    files: ["tests/**/*.js", "scripts/**/*.mjs", "*.config.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ["tests/e2e/**/*.js"],
    // worker.evaluate() bodies run inside the extension, where chrome exists.
    languageOptions: { globals: { chrome: "readonly" } },
    // Playwright fixtures use an empty destructuring pattern by convention.
    rules: { "no-empty-pattern": "off" },
  },
];
