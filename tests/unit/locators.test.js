// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

let L;
beforeAll(async () => {
  await import("../../src/locators.js");
  L = globalThis.LocatorLens;
});

beforeEach(() => {
  document.body.innerHTML = "";
});

const $ = (sel) => document.querySelector(sel);
const html = (markup) => {
  document.body.innerHTML = markup;
};
const best = (sel) => L.suggest($(sel))[0];

describe("getRole", () => {
  it.each([
    ["<button>x</button>", "button", "button"],
    ['<a href="/x">x</a>', "a", "link"],
    ["<a>x</a>", "a", null],
    ['<img alt="Logo" src="x.png">', "img", "img"],
    ['<img alt="" src="x.png">', "img", "presentation"],
    ["<input>", "input", "textbox"],
    ['<input type="email">', "input", "textbox"],
    ['<input type="checkbox">', "input", "checkbox"],
    ['<input type="radio">', "input", "radio"],
    ['<input type="submit">', "input", "button"],
    ['<input type="range">', "input", "slider"],
    ['<input type="number">', "input", "spinbutton"],
    ['<input type="search">', "input", "searchbox"],
    ['<input type="hidden">', "input", null],
    ['<input type="color">', "input", "textbox"],
    ['<input list="opts">', "input", "combobox"],
    ["<select><option>a</option></select>", "select", "combobox"],
    ["<select multiple><option>a</option></select>", "select", "listbox"],
    ['<select size="4"><option>a</option></select>', "select", "listbox"],
    ["<textarea></textarea>", "textarea", "textbox"],
    ["<h3>x</h3>", "h3", "heading"],
    ["<nav></nav>", "nav", "navigation"],
    ['<section aria-label="Seats"></section>', "section", "region"],
    ["<section></section>", "section", null],
    ["<div>x</div>", "div", null],
    ['<div role="switch tab">x</div>', "div", "switch"],
  ])("%s is %s", (markup, sel, role) => {
    html(markup);
    expect(L.getRole($(sel))).toBe(role);
  });
});

describe("accessibleName", () => {
  it("prefers aria-labelledby, then aria-label", () => {
    html('<span id="a">Seat</span><span id="b">R1-4</span><button aria-labelledby="a b" aria-label="no">x</button>');
    expect(L.accessibleName($("button"))).toBe("Seat R1-4");
  });

  it("falls through an aria-labelledby that points nowhere", () => {
    html('<button aria-labelledby="missing" aria-label="Close">x</button>');
    expect(L.accessibleName($("button"))).toBe("Close");
  });

  it("uses a label, by for= or by wrapping", () => {
    html('<label for="e">Email</label><input id="e"><label>Key <input id="k"></label>');
    expect(L.accessibleName($("#e"))).toBe("Email");
    expect(L.accessibleName($("#k"))).toBe("Key");
  });

  it("uses value or defaults for input buttons", () => {
    html('<input type="submit" id="a"><input type="reset" id="b"><input type="button" value="Go" id="c"><input type="button" id="d">');
    expect(L.accessibleName($("#a"))).toBe("Submit");
    expect(L.accessibleName($("#b"))).toBe("Reset");
    expect(L.accessibleName($("#c"))).toBe("Go");
    expect(L.accessibleName($("#d"))).toBe("");
  });

  it("uses alt for images and image inputs", () => {
    html('<img alt=" Venue  map " src="x"><input type="image" alt="Pay" src="x">');
    expect(L.accessibleName($("img"))).toBe("Venue map");
    expect(L.accessibleName($("input"))).toBe("Pay");
  });

  it("uses the legend for a fieldset", () => {
    html("<fieldset><legend>Payment</legend><input></fieldset>");
    expect(L.accessibleName($("fieldset"))).toBe("Payment");
  });

  it("builds names from content, skipping hidden parts and using child labels", () => {
    html(`<button>
      <svg aria-hidden="true"></svg>
      <span hidden>secret</span>
      <span style="display:none">gone</span>
      Buy <img alt="2" src="x"> <span aria-label="seats">🎟</span>
    </button>`);
    expect(L.accessibleName($("button"))).toBe("Buy 2 seats");
  });

  it("falls back to title, then placeholder", () => {
    html('<div role="img" title="Chart"></div><input placeholder="Search events">');
    expect(L.accessibleName($("div"))).toBe("Chart");
    expect(L.accessibleName($("input"))).toBe("Search events");
  });

  it("gives elements that don't take their name from content no name", () => {
    html("<nav>Lots of links</nav>");
    expect(L.accessibleName($("nav"))).toBe("");
  });
});

describe("isHidden", () => {
  it("sees hidden, aria-hidden, display:none on ancestors and visibility on the element", () => {
    html(`<div hidden><b id="a">x</b></div><div aria-hidden="true"><b id="b">x</b></div>
      <div style="display:none"><b id="c">x</b></div><b id="d" style="visibility:hidden">x</b><b id="e">x</b>`);
    expect(["a", "b", "c", "d", "e"].map((id) => L.isHidden($("#" + id)))).toEqual([true, true, true, true, false]);
  });
});

describe("suggest", () => {
  it("puts a unique role and name first", () => {
    html('<button data-testid="buy">Buy 2 seats</button>');
    const s = L.suggest($("button"));
    expect(s.map((c) => c.kind)).toEqual(["role", "testid", "css"]);
    expect(s[0].playwright).toBe("page.getByRole('button', { name: 'Buy 2 seats' })");
    expect(s[0].cypress).toBe("cy.findByRole('button', { name: 'Buy 2 seats' })");
    expect(s[0].matches).toBe(1);
  });

  it("adds exact: true when a shorter name is contained in another", () => {
    // Playwright's name match is a case-insensitive substring by default.
    html("<button>Sign in</button><button>Sign in with demo key</button>");
    expect(best("button").playwright).toBe("page.getByRole('button', { name: 'Sign in', exact: true })");
    expect(L.suggest(document.querySelectorAll("button")[1])[0].playwright)
      .toBe("page.getByRole('button', { name: 'Sign in with demo key' })");
  });

  it("ranks a duplicated name below every unique option", () => {
    html('<button data-testid="first">Delete</button><button>Delete</button>');
    const s = L.suggest($("button"));
    expect(s[0].kind).toBe("testid");
    const role = s.find((c) => c.kind === "role");
    expect(role.matches).toBe(2);
    expect(role.score).toBeLessThan(0);
  });

  it("ignores hidden elements when counting, like Playwright does", () => {
    html('<button style="display:none">Save</button><button id="v">Save</button>');
    expect(L.suggest($("#v"))[0].playwright).toBe("page.getByRole('button', { name: 'Save' })");
  });

  it("suggests getByRole without a name when the role alone is unique", () => {
    html("<main><p>hi</p></main>");
    expect(best("main").playwright).toBe("page.getByRole('main')");
    expect(best("main").cypress).toBe("cy.findByRole('main')");
  });

  it("offers label and placeholder for form fields", () => {
    html('<label for="q">Search</label><input id="q" placeholder="Event name">');
    const kinds = L.suggest($("input")).map((c) => [c.kind, c.playwright]);
    expect(kinds).toEqual([
      ["role", "page.getByRole('textbox', { name: 'Search' })"],
      ["label", "page.getByLabel('Search')"],
      ["placeholder", "page.getByPlaceholder('Event name')"],
      ["css", "page.locator('#q')"],
    ]);
  });

  it("uses exact label matching when one label contains another", () => {
    html('<label>Name <input id="a"></label><label>Name on card <input id="b"></label>');
    const label = L.suggest($("#a")).find((c) => c.kind === "label");
    expect(label.playwright).toBe("page.getByLabel('Name', { exact: true })");
    expect(label.matches).toBe(1);
  });

  it("counts aria-label and aria-labelledby as labels", () => {
    html('<input aria-label="Card number" id="a"><span id="l">Card number</span><div role="textbox" aria-labelledby="l"></div>');
    const label = L.suggest($("#a")).find((c) => c.kind === "label");
    expect(label.matches).toBe(2);
  });

  it("uses text for things that aren't controls", () => {
    html("<p>Total: <strong>$50.00</strong></p><p>Thanks!</p>");
    const s = L.suggest($("strong"));
    expect(s[0].kind).toBe("text");
    expect(s[0].playwright).toBe("page.getByText('$50.00')");
    expect(s[0].cypress).toBe("cy.contains('$50.00')");
  });

  it("uses exact text when the same words appear inside a longer string", () => {
    html("<p>Sold out</p><p>Sold out soon</p>");
    expect(best("p").playwright).toBe("page.getByText('Sold out', { exact: true })");
  });

  it("doesn't offer text when another element would match first", () => {
    html("<div><span>Venue 2</span></div>");
    expect(L.suggest($("div")).some((c) => c.kind === "text")).toBe(false);
  });

  it("skips text that is too long to be a sensible locator", () => {
    html(`<p>${"word ".repeat(30)}</p>`);
    expect(L.suggest($("p")).some((c) => c.kind === "text")).toBe(false);
  });

  it("flags a duplicated test id", () => {
    html('<div data-testid="row">a</div><div data-testid="row">b</div>');
    const t = L.suggest($("div")).find((c) => c.kind === "testid");
    expect(t.matches).toBe(2);
    expect(t.cypress).toBe(`cy.get('[data-testid="row"]')`);
  });

  it("always ends with a CSS fallback and a warning", () => {
    html("<div><span>a</span><span>b</span></div>");
    const css = L.suggest(document.querySelectorAll("span")[1]).at(-1);
    expect(css.kind).toBe("css");
    expect(css.note).toMatch(/Breaks when/);
  });

  it("escapes quotes, backslashes and newlines in generated code", () => {
    html(`<button>Don't \\ panic</button>`);
    expect(best("button").playwright).toBe("page.getByRole('button', { name: 'Don\\'t \\\\ panic' })");
    expect(L.quote("a\nb")).toBe("'a\\nb'");
  });

  it("escapes double quotes inside a Cypress test-id selector", () => {
    html('<div data-testid=\'say "hi"\'>x</div>');
    const t = L.suggest($("div")).find((c) => c.kind === "testid");
    expect(t.cypress).toBe(`cy.get('[data-testid="say \\\\"hi\\\\""]')`);
  });
});

describe("Cypress test-id selectors", () => {
  // Run the generated code with a fake cy that hands back the selector.
  const selectorFrom = (code) => new Function("cy", `return ${code};`)({ get: (sel) => sel });

  it.each(["plain", 'say "hi"', "back\\slash", 'both \\"', "new\nline"])("finds a test id of %j", (id) => {
    const div = document.createElement("div");
    div.setAttribute("data-testid", id);
    document.body.append(div);
    const t = L.suggest(div).find((c) => c.kind === "testid");
    expect(document.querySelector(selectorFrom(t.cypress))).toBe(div);
  });
});

describe("cssPath", () => {
  it("uses a stable id", () => {
    html('<div id="seat-map"><button>1</button></div>');
    expect(L.cssPath($("#seat-map"))).toBe("#seat-map");
  });

  it("skips generated ids and walks up with nth-of-type", () => {
    html('<ul id=":r3:"><li>a</li><li>b</li></ul><ul><li>c</li><li>d</li></ul>');
    const path = L.cssPath(document.querySelectorAll("li")[1]);
    expect(path).toBe("ul:nth-of-type(1) > li:nth-of-type(2)");
    expect(document.querySelectorAll(path)).toHaveLength(1);
  });

  it("anchors on the nearest stable ancestor id", () => {
    html('<section id="orders"><div><p>a</p><p>b</p></div></section><div><p>c</p><p>d</p></div>');
    expect(L.cssPath(document.querySelectorAll("p")[1])).toBe("#orders > div > p:nth-of-type(2)");
  });

  it("escapes ids with special characters", () => {
    html('<div id="a.b"></div>');
    expect(L.cssPath($("div"))).toBe("#a\\.b");
    expect(document.querySelector(L.cssPath($("div")))).toBe($("div"));
  });

  it("ignores duplicated ids", () => {
    html('<i id="x"></i><i id="x"></i>');
    expect(L.cssPath(document.querySelectorAll("i")[1])).toBe("i:nth-of-type(2)");
  });
});

describe("looksGenerated", () => {
  it.each([":r1:", "radix-42", "ember1234", "react-7", "a1b2c3d4e5", "field-1029"])("%s is generated", (id) => {
    expect(L.looksGenerated(id)).toBe(true);
  });
  it.each(["seat-map", "main", "order-12", "buy"])("%s is stable", (id) => {
    expect(L.looksGenerated(id)).toBe(false);
  });
});

describe("grade", () => {
  it("is good for role, label or text, ok for test id, poor for CSS or duplicates", () => {
    html(`<button id="a">Pay</button><div data-testid="t" id="b"></div><div id="c"></div>
      <div><i>x</i><i>x</i></div>`);
    expect(L.grade($("#a"))).toBe("good");
    expect(L.grade($("#b"))).toBe("ok");
    expect(L.grade($("#c"))).toBe("poor");
  });

  it("is poor when even the best option matches several elements", () => {
    html('<span data-testid="x"></span><span data-testid="x"></span>');
    // Both spans share a test id and have identical CSS paths except the index,
    // so the best unique option is CSS: poor.
    expect(L.grade($("span"))).toBe("poor");
  });
});
