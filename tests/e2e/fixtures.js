// Loads the real extension into Chromium.
//
// activeTab only grants access after a real toolbar click, which Playwright
// can't make, so the tests load a copy whose manifest also grants the local
// test server. The shipped manifest is unchanged (tests/unit/manifest.test.js).
import { test as base, chromium, expect } from "@playwright/test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const BASE = "http://127.0.0.1:4310";
const repo = new URL("../..", import.meta.url).pathname;

function buildTestCopy() {
  const dir = mkdtempSync(join(tmpdir(), "locator-lens-"));
  for (const part of ["manifest.json", "src", "icons"]) cpSync(join(repo, part), join(dir, part), { recursive: true });
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  manifest.host_permissions = ["http://127.0.0.1/*"];
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return dir;
}

export const test = base.extend({
  // One browser per test file is plenty; each test gets a fresh page.
  context: [
    async ({}, use) => {
      const ext = buildTestCopy();
      const context = await chromium.launchPersistentContext("", {
        channel: "chromium",
        executablePath: process.env.PW_CHROMIUM || undefined,
        args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
        permissions: ["clipboard-read", "clipboard-write"],
      });
      await use(context);
      await context.close();
    },
    { scope: "test" },
  ],
  worker: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent("serviceworker");
    await use(sw);
  },
  page: async ({ context }, use) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await use(page);
  },
  // Turns the lens on or off in the current tab, like clicking the toolbar button.
  toggle: async ({ page, worker }, use) => {
    await use(async () => {
      await page.bringToFront();
      const ok = await worker.evaluate(async (url) => {
        const [tab] = await chrome.tabs.query({ url });
        return globalThis.toggleLens(tab);
      }, page.url());
      expect(ok).toBe(true);
    });
  },
});

export { expect };

// The overlay lives in an open shadow root; Playwright's CSS engine pierces it.
export const lens = (page) => page.locator("#locator-lens-root");
