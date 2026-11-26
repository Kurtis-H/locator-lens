// locator-lens core: work out an element's role and accessible name, and rank
// the locators a test could use to find it.
//
// Plain script (no modules) so it can be injected into any page as-is. It
// defines globalThis.LocatorLens. The unit tests load it the same way.
(function (root) {
  "use strict";

  // Implicit ARIA roles for the elements tests usually target.
  const INPUT_ROLES = {
    button: "button",
    submit: "button",
    reset: "button",
    image: "button",
    checkbox: "checkbox",
    radio: "radio",
    range: "slider",
    number: "spinbutton",
    search: "searchbox",
    email: "textbox",
    tel: "textbox",
    text: "textbox",
    url: "textbox",
    password: "textbox",
  };

  const TAG_ROLES = {
    article: "article",
    aside: "complementary",
    button: "button",
    dialog: "dialog",
    fieldset: "group",
    form: "form",
    h1: "heading",
    h2: "heading",
    h3: "heading",
    h4: "heading",
    h5: "heading",
    h6: "heading",
    hr: "separator",
    li: "listitem",
    main: "main",
    nav: "navigation",
    ol: "list",
    option: "option",
    progress: "progressbar",
    table: "table",
    tbody: "rowgroup",
    td: "cell",
    textarea: "textbox",
    th: "columnheader",
    thead: "rowgroup",
    tr: "row",
    ul: "list",
  };

  // Roles whose name comes from their text content.
  const NAME_FROM_CONTENT = new Set([
    "button", "cell", "checkbox", "columnheader", "heading", "link", "listitem",
    "menuitem", "menuitemcheckbox", "menuitemradio", "option", "radio", "row",
    "switch", "tab", "tooltip", "treeitem",
  ]);

  // Roles worth suggesting getByRole for. Landmarks and structure ("list",
  // "row"...) are rarely what a test means to click.
  const TARGET_ROLES = new Set([
    "button", "checkbox", "combobox", "dialog", "heading", "link", "listbox",
    "menuitem", "option", "radio", "searchbox", "slider", "spinbutton", "switch",
    "tab", "textbox", "img", "alert", "status", "navigation", "main", "region",
  ]);

  const FORM_CONTROLS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

  const normalize = (s) => (s || "").replace(/\s+/g, " ").trim();

  // ---- per-pass cache ----
  //
  // Ranking one element compares it with every other element on the page, so
  // drawing outlines for hundreds of elements would recompute the same roles,
  // names and styles over and over. withCache() remembers them for one pass
  // over a page that isn't changing (one redraw, one hover).
  let cache = null;

  function withCache(fn) {
    if (cache) return fn();
    cache = { role: new WeakMap(), name: new WeakMap(), hidden: new WeakMap(), ancestor: new WeakMap(), all: null, byRole: null };
    try {
      return fn();
    } finally {
      cache = null;
    }
  }

  function cached(kind, el, compute) {
    if (!cache) return compute(el);
    const map = cache[kind];
    if (map.has(el)) return map.get(el);
    const value = compute(el);
    map.set(el, value);
    return value;
  }

  const getRole = (el) => cached("role", el, computeRole);

  function computeRole(el) {
    const explicit = normalize(el.getAttribute("role")).split(" ")[0];
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === "a" || tag === "area") return el.hasAttribute("href") ? "link" : null;
    if (tag === "img") return el.getAttribute("alt") === "" ? "presentation" : "img";
    if (tag === "input") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (type === "hidden") return null;
      if ((type === "text" || type === "search" || !INPUT_ROLES[type]) && el.hasAttribute("list")) {
        return "combobox";
      }
      return INPUT_ROLES[type] || "textbox";
    }
    if (tag === "select") {
      return el.multiple || Number(el.getAttribute("size")) > 1 ? "listbox" : "combobox";
    }
    if (tag === "section") {
      return el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby") ? "region" : null;
    }
    return TAG_ROLES[tag] || null;
  }

  // Hidden from the accessibility tree, the way Playwright's getByRole sees it.
  const isHidden = (el) => cached("hidden", el, computeHidden);

  function computeHidden(el) {
    if (el.getAttribute("aria-hidden") === "true" || el.hidden) return true;
    const style = el.ownerDocument.defaultView.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return true;
    return el.parentElement ? hiddenAncestor(el.parentElement) : false;
  }

  // visibility can be overridden by a child, so only these count from above.
  const hiddenAncestor = (el) => cached("ancestor", el, (node) => {
    if (node.getAttribute("aria-hidden") === "true" || node.hidden) return true;
    if (node.ownerDocument.defaultView.getComputedStyle(node).display === "none") return true;
    return node.parentElement ? hiddenAncestor(node.parentElement) : false;
  });

  function textFromContent(el) {
    let out = "";
    for (const child of el.childNodes) {
      if (child.nodeType === 3) {
        out += child.textContent;
      } else if (child.nodeType === 1) {
        if (isHidden(child)) continue;
        const label = normalize(child.getAttribute("aria-label"));
        if (label) out += " " + label + " ";
        else if (child.tagName === "IMG") out += " " + (child.getAttribute("alt") || "") + " ";
        else out += " " + textFromContent(child) + " ";
      }
    }
    return out;
  }

  function labelText(el) {
    const parts = [];
    if (el.labels) for (const l of el.labels) parts.push(textFromContent(l));
    return normalize(parts.join(" ")) || null;
  }

  const accessibleName = (el) => cached("name", el, computeName);

  function computeName(el) {
    const doc = el.ownerDocument;
    const labelledBy = normalize(el.getAttribute("aria-labelledby"));
    if (labelledBy) {
      const text = labelledBy
        .split(" ")
        .map((id) => doc.getElementById(id))
        .filter(Boolean)
        .map((n) => normalize(n.getAttribute("aria-label")) || textFromContent(n))
        .join(" ");
      if (normalize(text)) return normalize(text);
    }
    const ariaLabel = normalize(el.getAttribute("aria-label"));
    if (ariaLabel) return ariaLabel;

    const tag = el.tagName;
    if (FORM_CONTROLS.has(tag)) {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (tag === "INPUT" && ["button", "submit", "reset"].includes(type)) {
        return normalize(el.value) || { submit: "Submit", reset: "Reset" }[type] || "";
      }
      if (tag === "INPUT" && type === "image") return normalize(el.getAttribute("alt"));
      const fromLabel = labelText(el);
      if (fromLabel) return fromLabel;
    }
    if (tag === "IMG") {
      const alt = normalize(el.getAttribute("alt"));
      if (alt) return alt;
    }
    if (tag === "FIELDSET") {
      const legend = el.querySelector(":scope > legend");
      if (legend) return normalize(textFromContent(legend));
    }
    const role = getRole(el);
    if (role && NAME_FROM_CONTENT.has(role)) {
      const text = normalize(textFromContent(el));
      if (text) return text;
    }
    const title = normalize(el.getAttribute("title"));
    if (title) return title;
    if (tag === "INPUT" || tag === "TEXTAREA") return normalize(el.getAttribute("placeholder"));
    return "";
  }

  // ---- matching, mirroring how each Playwright locator searches ----

  const includesCI = (haystack, needle) => haystack.toLowerCase().includes(needle.toLowerCase());

  function all(doc) {
    if (cache && cache.all) return cache.all;
    const list = Array.from(doc.body ? doc.body.querySelectorAll("*") : []);
    if (cache) cache.all = list;
    return list;
  }

  // Visible elements grouped by role, so counting one role doesn't scan the page.
  function withRole(doc, role) {
    if (!cache) return all(doc).filter((el) => getRole(el) === role && !isHidden(el));
    if (!cache.byRole) {
      cache.byRole = new Map();
      for (const el of all(doc)) {
        const r = getRole(el);
        if (!r) continue;
        if (!cache.byRole.has(r)) cache.byRole.set(r, []);
        cache.byRole.get(r).push(el);
      }
    }
    return (cache.byRole.get(role) || []).filter((el) => !isHidden(el));
  }

  function countRole(doc, role, name, exact) {
    return withRole(doc, role).filter((el) => {
      if (name === null) return true;
      const n = accessibleName(el);
      return exact ? n === name : includesCI(n, name);
    }).length;
  }

  function countLabel(doc, label, exact) {
    return all(doc).filter((el) => {
      if (!(FORM_CONTROLS.has(el.tagName) || el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby"))) {
        return false;
      }
      if (isHidden(el)) return false;
      const texts = [labelText(el), normalize(el.getAttribute("aria-label"))];
      const by = normalize(el.getAttribute("aria-labelledby"));
      if (by) texts.push(accessibleName(el));
      return texts.some((t) => t && (exact ? t === label : includesCI(t, label)));
    }).length;
  }

  function countPlaceholder(doc, text) {
    return all(doc).filter(
      (el) => (el.tagName === "INPUT" || el.tagName === "TEXTAREA") && !isHidden(el) &&
        includesCI(el.getAttribute("placeholder") || "", text),
    ).length;
  }

  // getByText matches the innermost elements whose text contains the string.
  function textMatches(doc, text, exact) {
    const matches = (el) => {
      if (["SCRIPT", "STYLE", "HEAD", "TITLE"].includes(el.tagName)) return false;
      const t = normalize(el.textContent);
      return exact ? t === text : includesCI(t, text);
    };
    return all(doc).filter(
      (el) => matches(el) && !isHidden(el) && !Array.from(el.children).some(matches),
    );
  }

  const testIdOf = (el) => el.getAttribute("data-testid");

  // ---- CSS fallback ----

  function cssEscape(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c).replace(/^(\d)/, "\\3$1 ");
  }

  // Escape for a double-quoted CSS string: backslashes first, then quotes and
  // newlines (which can't appear raw in a CSS string).
  function cssString(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\a ");
  }

  // Ids like ":r1:", "radix-42" or "ember1234" change between builds.
  function looksGenerated(id) {
    return /^:|:$|\d{3,}|[a-f0-9]{8,}|^(ember|react|radix|mui|headlessui)[-_]?\d/i.test(id);
  }

  function cssPath(el) {
    const doc = el.ownerDocument;
    const parts = [];
    for (let node = el; node && node.nodeType === 1 && node !== doc.documentElement; node = node.parentElement) {
      if (node.id && !looksGenerated(node.id) && doc.querySelectorAll("#" + cssEscape(node.id)).length === 1) {
        parts.unshift("#" + cssEscape(node.id));
        break;
      }
      const tag = node.tagName.toLowerCase();
      const parent = node.parentElement;
      const same = parent ? Array.from(parent.children).filter((c) => c.tagName === node.tagName) : [node];
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
      const selector = parts.join(" > ");
      if (doc.querySelectorAll(selector).length === 1 && doc.querySelector(selector) === el) return selector;
    }
    return parts.join(" > ");
  }

  // ---- output ----

  function quote(s) {
    return "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'";
  }

  function nameOption(name, exact) {
    if (name === null) return "";
    return exact ? `, { name: ${quote(name)}, exact: true }` : `, { name: ${quote(name)} }`;
  }

  const SCORES = { role: 100, label: 90, placeholder: 80, text: 70, testid: 60, css: 20 };

  function candidate(kind, matches, playwright, cypress, note) {
    // Anything that matches more than one element is a trap: it fails
    // Playwright's strict mode, so rank it below every unique option.
    const score = SCORES[kind] - (matches === 1 ? 0 : 200);
    return { kind, matches, playwright, cypress, note: note || null, score };
  }

  // Pick plain or exact matching: plain if it's already unique, exact if that
  // makes it unique, otherwise report the plain count.
  function bestOf(plainCount, exactCount) {
    if (plainCount === 1) return { exact: false, matches: 1 };
    if (exactCount === 1) return { exact: true, matches: 1 };
    return { exact: false, matches: plainCount };
  }

  function suggest(el) {
    const doc = el.ownerDocument;
    const out = [];
    const role = getRole(el);
    const name = accessibleName(el);

    if (role && TARGET_ROLES.has(role)) {
      const n = name || null;
      const { exact, matches } = bestOf(countRole(doc, role, n, false), countRole(doc, role, n, true));
      out.push(candidate(
        "role", matches,
        `page.getByRole(${quote(role)}${nameOption(n, exact)})`,
        `cy.findByRole(${quote(role)}${n === null ? "" : `, { name: ${quote(n)} }`})`,
      ));
    }

    const label = FORM_CONTROLS.has(el.tagName) ? labelText(el) || normalize(el.getAttribute("aria-label")) : null;
    if (label) {
      const { exact, matches } = bestOf(countLabel(doc, label, false), countLabel(doc, label, true));
      out.push(candidate(
        "label", matches,
        `page.getByLabel(${quote(label)}${exact ? ", { exact: true }" : ""})`,
        `cy.findByLabelText(${quote(label)})`,
      ));
    }

    const placeholder = normalize(el.getAttribute("placeholder"));
    if (placeholder && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
      out.push(candidate(
        "placeholder", countPlaceholder(doc, placeholder),
        `page.getByPlaceholder(${quote(placeholder)})`,
        `cy.findByPlaceholderText(${quote(placeholder)})`,
      ));
    }

    // Text, for things that aren't controls (a price, a message, a card title).
    const text = normalize(el.textContent);
    if (text && text.length <= 80 && !FORM_CONTROLS.has(el.tagName) && !(role && TARGET_ROLES.has(role) && name)) {
      const plain = textMatches(doc, text, false);
      const exactHits = textMatches(doc, text, true);
      const picked = bestOf(plain.length, exactHits.length);
      const hits = picked.exact ? exactHits : plain;
      if (hits.length === 0 || hits.includes(el)) {
        out.push(candidate(
          "text", picked.matches,
          `page.getByText(${quote(text)}${picked.exact ? ", { exact: true }" : ""})`,
          `cy.contains(${quote(text)})`,
        ));
      }
    }

    const testId = testIdOf(el);
    if (testId) {
      const count = all(doc).filter((e) => testIdOf(e) === testId).length;
      out.push(candidate(
        "testid", count,
        `page.getByTestId(${quote(testId)})`,
        `cy.get(${quote(`[data-testid="${cssString(testId)}"]`)})`,
      ));
    }

    const css = cssPath(el);
    const cssCount = doc.querySelectorAll(css).length;
    out.push(candidate(
      "css", cssCount,
      `page.locator(${quote(css)})`,
      `cy.get(${quote(css)})`,
      "Breaks when the page layout changes. Prefer adding a label or test id.",
    ));

    return out.sort((a, b) => b.score - a.score);
  }

  // The quality of an element's best option, for the overlay colours.
  function grade(el) {
    const best = suggest(el)[0];
    if (best.matches !== 1) return "poor";
    if (best.kind === "css") return "poor";
    if (best.kind === "testid") return "ok";
    return "good";
  }

  root.LocatorLens = {
    getRole, accessibleName, isHidden, withCache,
    suggest: (el) => withCache(() => suggest(el)),
    grade: (el) => withCache(() => grade(el)), cssPath, cssString, looksGenerated, quote,
  };
})(globalThis);
