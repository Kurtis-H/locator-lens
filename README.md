# Locator Lens

[![CI](https://github.com/Kurtis-H/locator-lens/actions/workflows/ci.yml/badge.svg)](https://github.com/Kurtis-H/locator-lens/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Kurtis-H/locator-lens/actions/workflows/codeql.yml/badge.svg)](https://github.com/Kurtis-H/locator-lens/actions/workflows/codeql.yml)

A Chrome extension for test automation. Click any element on any page and it tells you the most robust way for a test to find it, as Playwright or Cypress code, ready to copy.

```
Locator Lens                                              [Done (Esc)]
───────────────────────────────────────────────────────────────────────
ROLE      [Copy Playwright] [Copy Cypress]
          page.getByRole('button', { name: 'Sign in', exact: true })
TESTID    page.getByTestId('sign-in')
CSS       page.locator('nav > button:nth-of-type(1)')
          Breaks when the page layout changes. Prefer adding a label or test id.
```

While it's on, every element gets a dashed outline:

* **green:** findable by role, label or text, the way a user finds it
* **amber:** only by test id
* **red:** only by CSS, or nothing unique at all, which usually means an accessibility gap worth a bug report

## How it ranks locators

It follows [Playwright's own priority](https://playwright.dev/docs/locators): what a user perceives first, implementation details last.

1. `getByRole` with the accessible name
2. `getByLabel` for form fields
3. `getByPlaceholder`
4. `getByText` for things that aren't controls
5. `getByTestId`
6. CSS, with a warning

Every option is checked against the whole page the way Playwright would run it, and anything that matches more than one element drops below every unique option, with a "Matches 3 elements" warning (it would fail Playwright's strict mode).

It handles the cases that make hand-written locators flaky:

* **Names inside names.** Playwright matches names as case-insensitive substrings, so `{ name: 'Sign in' }` also matches "Sign in with demo key". The lens adds `exact: true` only when that's what makes it unique.
* **Hidden twins.** A `display:none` copy of a button doesn't count, just as in `getByRole`.
* **Accessible names** from `aria-labelledby`, `aria-label`, `<label>` (wrapping or `for=`), `alt`, `<legend>`, `title`, button values and visible content, skipping `aria-hidden` icons.
* **Generated ids** like `:r7:`, `react-17` or `ember1234` are never used in CSS fallbacks.
* **Disabled controls** still work. Chrome never sends them a `click`, so the lens picks on `pointerdown`.
* **Quotes and backslashes** in names are escaped, so the copied code always runs.

Cypress output uses [Testing Library](https://testing-library.com/docs/cypress-testing-library/intro/) (`cy.findByRole`) for role, label and placeholder locators, `cy.contains` for text, and `cy.get` for the rest.

## Install

1. Download `locator-lens-*.zip` from the latest [CI run](https://github.com/Kurtis-H/locator-lens/actions/workflows/ci.yml) (or `npm run package`) and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose the folder.
3. On any page, click the toolbar button or press **Alt+Shift+L**. Click elements to inspect them; press **Esc** to stop.

## Privacy and permissions

| Permission | Why |
|---|---|
| `activeTab` | Access to the current page only after you click the button or press the shortcut there |
| `scripting` | To add the overlay to that page |
| `clipboardWrite` | For the copy buttons |

It has no host permissions, no always-on content scripts, no network requests and no storage. Page text only ever reaches the panel as text (`textContent`), and the panel lives in its own shadow root, so a page can't inject markup into it or restyle it. A unit test fails if the manifest ever asks for more.

## How it's tested

| | |
|---|---|
| Unit (Vitest + jsdom, 82 tests) | Roles for every common element, each accessible-name rule, ranking, substring vs exact matching, hidden elements, CSS fallbacks, generated ids, escaping, and the manifest's permissions. Coverage gate at 95% |
| Extension (Playwright, 15 tests) | Loads the real extension into Chromium and drives it like a user: outlines, hover, picking, copy to clipboard, Escape, toggling, disabled controls, and the badge on pages it can't run on |
| The sweep | Clicks **every** element on a test page full of traps, takes the top suggestion, runs it in Playwright and checks it finds exactly that element. Planting a bug in the exact-match logic makes it fail on the right buttons |
| Hostile page | A page whose text is an `<img onerror>` payload, which stops click propagation and has aggressive CSS. The payload stays text, nothing runs, links don't navigate, and the panel keeps its own styles |
| Speed | A page of 4,500 elements must light up in under 2 seconds. Roles, names and visibility are computed once per redraw and the page is indexed by role, which took this from about 4.7 s to 0.24 s |
| Static | ESLint, `npm audit`, CodeQL (JavaScript and Actions) |

The end-to-end tests load a copy of the extension that also has access to the local test server, because `activeTab` is only granted by a real toolbar click, which automation can't make. The shipped manifest is unchanged.

```bash
npm ci
npm test              # unit tests
npm run coverage      # with the coverage gate
npx playwright install chromium
npm run e2e           # loads the extension in Chromium
npm run package       # builds the zip
```

## Layout

```
manifest.json         Manifest V3
src/locators.js       roles, accessible names, ranking (no DOM side effects)
src/content.js        the overlay and panel
src/background.js     injects the two scripts on click or shortcut
tests/unit/           Vitest
tests/e2e/            Playwright, with test pages in tests/e2e/pages
```

It's part of a set: [booking-web](https://github.com/Kurtis-H/booking-web) and [booking-mobile](https://github.com/Kurtis-H/booking-mobile) were written with role-first locators, and this is the tool that checks a page supports them.
