import { BASE, expect, lens, test } from "./fixtures.js";

const OUTLINED = [
  "a[href]", "button", "input:not([type=hidden])", "select", "textarea", "summary",
  "[role]", "[data-testid]", "[aria-label]", "h1", "h2", "h3", "h4", "h5", "h6", "img[alt]",
].join(",");

// Runs a suggested line of Playwright code against the real page.
function run(page, code) {
  return new Function("page", `return ${code};`)(page);
}

test.describe("on a booking page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/booking.html`);
  });

  test("every suggestion it calls unique finds exactly the clicked element", async ({ page, toggle }) => {
    test.setTimeout(180_000);
    // Number every element, so we can tell which one a locator found, and list
    // the ones worth clicking: everything the lens outlines, plus plain text.
    const targets = await page.evaluate((sel) => {
      document.querySelectorAll("body *").forEach((el, i) => el.setAttribute("data-probe", String(i)));
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
      };
      return [...document.querySelectorAll(sel)].filter(visible).map((el) => el.getAttribute("data-probe"));
    }, OUTLINED + ",p,span,strong,label,li");
    expect(targets.length).toBeGreaterThan(40);

    const report = [];
    for (const id of targets) {
      const target = page.locator(`[data-probe="${id}"]`);
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      const point = { x: box.x + 2, y: box.y + 2 };
      // The lens describes whatever is under the cursor, which may be a child.
      const picked = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute("data-probe"), point);
      await toggle();
      await page.mouse.click(point.x, point.y);
      const first = lens(page).locator("li").first();
      const code = await first.locator("code.pw").textContent({ timeout: 5000 });
      const claimsUnique = (await first.locator(".warn").count()) === 0;
      await page.keyboard.press("Escape");
      await expect(lens(page)).toHaveCount(0);

      const found = run(page, code);
      const hits = await found.count();
      const probe = hits === 1 ? await found.getAttribute("data-probe") : null;
      report.push({ picked, code, claimsUnique, hits, probe });
    }

    const wrong = report.filter((r) => r.claimsUnique && (r.hits !== 1 || r.probe !== r.picked));
    expect(wrong, JSON.stringify(wrong, null, 2)).toEqual([]);
    // Only the deliberately identical "Plain box" spans may lack a unique option.
    const ambiguous = new Set(report.filter((r) => !r.claimsUnique).map((r) => r.picked));
    expect(ambiguous.size).toBeLessThanOrEqual(2);
  });

  test("outlines elements and grades them", async ({ page, toggle }) => {
    await toggle();
    const layer = lens(page).locator("[data-layer=outlines]");
    await expect(layer).toHaveAttribute("data-outlines", /^[1-9]\d*$/);
    await expect(layer.locator(".box.good").first()).toBeAttached();
    expect(await layer.locator(".box.good").count()).toBeGreaterThan(20);
  });

  test("shows the best locator on hover", async ({ page, toggle }) => {
    await toggle();
    await page.getByRole("button", { name: "Buy 2 seats" }).hover({ force: true });
    await expect(lens(page).getByRole("status")).toHaveText("page.getByRole('button', { name: 'Buy 2 seats' })");
  });

  test("ranks options best first and warns about ambiguous ones", async ({ page, toggle }) => {
    await toggle();
    await page.locator("li", { hasText: "Order #14" }).getByRole("button").click({ force: true });
    const items = lens(page).locator("li");
    // Three "Delete" buttons and no test id on this one: CSS is the only unique option.
    await expect(items.first()).toHaveAttribute("data-kind", "css");
    const role = lens(page).locator("li[data-kind=role]");
    await expect(role.locator(".warn")).toContainText("Matches 3 elements");
  });

  test("works on disabled controls, which never get click events", async ({ page, toggle }) => {
    await toggle();
    await page.getByRole("button", { name: "Seat R1-11" }).click({ force: true });
    await expect(lens(page).locator("code.pw").first()).toHaveText("page.getByRole('button', { name: 'Seat R1-11' })");
  });

  test("uses exact matching when one name contains another", async ({ page, toggle }) => {
    await toggle();
    await page.getByRole("button", { name: "Sign in", exact: true }).click({ force: true });
    await expect(lens(page).locator("code.pw").first()).toHaveText(
      "page.getByRole('button', { name: 'Sign in', exact: true })",
    );
  });

  test("copies Playwright and Cypress code", async ({ page, toggle }) => {
    await toggle();
    await page.getByLabel("Quantity").click({ force: true });
    const best = lens(page).locator("li").first();
    await best.locator("button[data-copy=playwright]").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "page.getByRole('combobox', { name: 'Quantity' })",
    );
    await best.locator("button[data-copy=cypress]").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "cy.findByRole('combobox', { name: 'Quantity' })",
    );
  });

  test("keeps the page from reacting while picking, and Escape turns it off", async ({ page, toggle }) => {
    await toggle();
    await page.getByRole("link", { name: "My orders" }).click({ force: true });
    expect(page.url()).toBe(`${BASE}/booking.html`);
    expect(await page.evaluate(() => window.clicks)).toBe(0);
    await page.keyboard.press("Escape");
    await expect(lens(page)).toHaveCount(0);
    await page.getByRole("link", { name: "My orders" }).click();
    expect(page.url()).toBe(`${BASE}/booking.html#orders`);
    expect(await page.evaluate(() => window.clicks)).toBe(1);
  });

  test("the toolbar button toggles it off again", async ({ page, toggle }) => {
    await toggle();
    await expect(lens(page)).toHaveCount(1);
    await toggle();
    await expect(lens(page)).toHaveCount(0);
  });
});

test.describe("on a hostile page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/hostile.html`);
  });

  test("shows page text as text, never as markup", async ({ page, toggle }) => {
    await toggle();
    await page.locator("#evil").click({ force: true });
    await expect(lens(page).locator("code.pw").first()).toContainText('<img src=x onerror="window.pwned=1">');
    await expect(lens(page).locator("img")).toHaveCount(0);
    expect(await page.evaluate(() => window.pwned)).toBe(0);
  });

  test("still works when the page stops click propagation, and doesn't navigate away", async ({ page, toggle }) => {
    await toggle();
    await page.locator("#away").click({ force: true });
    await expect(lens(page).locator("code.pw").first()).toHaveText(
      "page.getByRole('link', { name: 'Leave this page' })",
    );
    expect(page.url()).toBe(`${BASE}/hostile.html`);
  });

  test("escapes quotes and backslashes so the code is valid", async ({ page, toggle }) => {
    await toggle();
    await page.locator("p").click({ force: true });
    const code = await lens(page).locator("code.pw").first().textContent();
    await page.keyboard.press("Escape");
    await expect(run(page, code)).toHaveCount(1);
  });

  test("page CSS doesn't reach the panel", async ({ page, toggle }) => {
    await toggle();
    await page.locator("#evil").click({ force: true });
    const font = await lens(page).locator("h2").evaluate((h) => getComputedStyle(h).fontFamily);
    expect(font).not.toContain("Comic Sans");
  });
});

test("says when it can't run on a page", async ({ page, worker }) => {
  await page.goto("chrome://version");
  const result = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const ok = await globalThis.toggleLens(tab);
    return { ok, badge: await chrome.action.getBadgeText({ tabId: tab.id }) };
  });
  expect(result).toEqual({ ok: false, badge: "!" });
});
