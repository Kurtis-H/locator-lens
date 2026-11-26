// locator-lens overlay. Injected (with locators.js) when you click the toolbar
// button or press Alt+Shift+L; injecting again turns it off.
//
// Everything is drawn inside one shadow root so the page's CSS can't break it
// and ours can't leak out. Page text only ever reaches the panel through
// textContent, never innerHTML, so a hostile page can't inject markup.
(function () {
  "use strict";

  if (globalThis.__locatorLens) {
    globalThis.__locatorLens.toggle();
    return;
  }

  const L = globalThis.LocatorLens;
  const MAX_OUTLINES = 400;
  const OUTLINE_SELECTOR = [
    "a[href]", "button", "input:not([type=hidden])", "select", "textarea", "summary",
    "[role]", "[data-testid]", "[aria-label]", "h1", "h2", "h3", "h4", "h5", "h6", "img[alt]",
  ].join(",");

  const STYLE = `
    :host { all: initial; }
    .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; }
    .box { position: fixed; box-sizing: border-box; border: 1px dashed; border-radius: 2px; }
    .box.good { border-color: #16a34a; }
    .box.ok { border-color: #d97706; }
    .box.poor { border-color: #dc2626; }
    .hover { position: fixed; box-sizing: border-box; border: 2px solid #2563eb;
      background: rgba(37, 99, 235, 0.08); border-radius: 2px; }
    .tip { position: fixed; max-width: 520px; padding: 4px 8px; border-radius: 4px;
      background: #111827; color: #f9fafb; font: 12px/1.4 ui-monospace, Menlo, Consolas, monospace;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .panel { position: fixed; right: 16px; bottom: 16px; width: min(560px, calc(100vw - 32px));
      max-height: 60vh; overflow: auto; pointer-events: auto; z-index: 2147483647;
      background: #fff; color: #111827; border: 1px solid #d1d5db; border-radius: 8px;
      box-shadow: 0 10px 30px rgba(0,0,0,.2); font: 13px/1.45 system-ui, sans-serif; }
    .panel header { display: flex; align-items: center; justify-content: space-between;
      gap: 8px; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
    .panel h2 { margin: 0; font-size: 14px; }
    .panel .hint { margin: 0; padding: 8px 12px; color: #4b5563; }
    .panel ol { list-style: none; margin: 0; padding: 0; }
    .panel li { padding: 8px 12px; border-top: 1px solid #f3f4f6; }
    .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .kind { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em;
      padding: 1px 6px; border-radius: 999px; background: #e5e7eb; }
    .kind.best { background: #dcfce7; color: #166534; }
    code { display: block; margin: 4px 0; font: 12px/1.4 ui-monospace, Menlo, Consolas, monospace;
      word-break: break-all; }
    .warn { color: #b91c1c; font-size: 12px; }
    .note { color: #6b7280; font-size: 12px; }
    button { font: inherit; font-size: 12px; padding: 3px 8px; border-radius: 4px;
      border: 1px solid #d1d5db; background: #f9fafb; color: #111827; cursor: pointer; }
    button:focus-visible { outline: 2px solid #2563eb; outline-offset: 1px; }
  `;

  const state = { on: false, host: null, root: null, layer: null, hoverBox: null, tip: null, panel: null,
    hovered: null, raf: 0 };

  const el = (tag, props = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("data-") || k.startsWith("aria-") || k === "role") node.setAttribute(k, v);
      else node[k] = v;
    }
    for (const c of children) node.append(c);
    return node;
  };

  const isOurs = (node) => node === state.host || (node && state.host && state.host.contains(node));

  function place(box, rect) {
    box.style.left = rect.left + "px";
    box.style.top = rect.top + "px";
    box.style.width = rect.width + "px";
    box.style.height = rect.height + "px";
  }

  function visibleRect(node) {
    const r = node.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return null;
    return r;
  }

  function drawOutlines() {
    state.layer.querySelectorAll(".box").forEach((b) => b.remove());
    let drawn = 0;
    for (const node of document.querySelectorAll(OUTLINE_SELECTOR)) {
      if (drawn >= MAX_OUTLINES) break;
      if (isOurs(node) || L.isHidden(node)) continue;
      const rect = visibleRect(node);
      if (!rect) continue;
      const box = el("div", { class: "box " + L.grade(node), "data-grade": L.grade(node) });
      place(box, rect);
      state.layer.append(box);
      drawn++;
    }
    state.layer.dataset.outlines = String(drawn);
  }

  const redraw = () => {
    cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(() => {
      if (!state.on) return;
      drawOutlines();
      if (state.hovered) showHover(state.hovered);
    });
  };

  function showHover(node) {
    const rect = node.getBoundingClientRect();
    place(state.hoverBox, rect);
    state.hoverBox.hidden = false;
    state.tip.textContent = L.suggest(node)[0].playwright;
    state.tip.hidden = false;
    const below = rect.bottom + 6;
    state.tip.style.left = Math.max(4, Math.min(rect.left, innerWidth - 530)) + "px";
    state.tip.style.top = (below + 24 < innerHeight ? below : Math.max(4, rect.top - 28)) + "px";
  }

  async function copy(text, button) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Some pages block the async clipboard; fall back to a hidden textarea.
      const area = el("textarea", { value: text });
      state.root.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    button.dataset.copied = "true";
    const label = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = label;
    }, 1200);
  }

  function showPanel(target) {
    const suggestions = L.suggest(target);
    const list = el("ol", { "aria-label": "Locators, best first" });
    suggestions.forEach((s, i) => {
      const pw = el("button", { type: "button", text: "Copy Playwright", "data-copy": "playwright" });
      const cy = el("button", { type: "button", text: "Copy Cypress", "data-copy": "cypress" });
      pw.addEventListener("click", () => copy(s.playwright, pw));
      cy.addEventListener("click", () => copy(s.cypress, cy));
      const item = el("li", { "data-kind": s.kind }, [
        el("div", { class: "row" }, [
          el("span", { class: "kind" + (i === 0 && s.matches === 1 ? " best" : ""), text: s.kind }),
          pw,
          cy,
        ]),
        el("code", { class: "pw", text: s.playwright }),
      ]);
      if (s.matches !== 1) {
        item.append(el("div", { class: "warn", text: `Matches ${s.matches} elements. Playwright's strict mode will fail.` }));
      }
      if (s.note) item.append(el("div", { class: "note", text: s.note }));
      list.append(item);
    });

    const close = el("button", { type: "button", text: "Done (Esc)", "data-action": "close" });
    close.addEventListener("click", stop);
    const panel = el("section", { class: "panel", role: "dialog", "aria-label": "Locator Lens" }, [
      el("header", {}, [el("h2", { text: "Locator Lens" }), close]),
      el("p", { class: "hint", text: "Click another element to inspect it." }),
      list,
    ]);
    state.panel?.remove();
    state.panel = panel;
    state.root.append(panel);
    panel.querySelector("button[data-copy]")?.focus({ preventScroll: true });
  }

  // ---- event handlers (capture phase, so the page doesn't react while picking) ----

  function onMove(e) {
    const node = e.composedPath ? e.composedPath()[0] : e.target;
    if (!(node instanceof Element) || isOurs(node)) {
      state.hoverBox.hidden = true;
      state.tip.hidden = true;
      state.hovered = null;
      return;
    }
    state.hovered = node;
    showHover(node);
  }

  function swallow(e) {
    if (isOurs(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
  }

  // Pick on pointerdown, not click: Chrome never fires click on a disabled
  // control, and "is this button disabled?" is a common thing to test.
  function onPick(e) {
    if (isOurs(e.target)) return;
    swallow(e);
    if (e.button === 0 && e.target instanceof Element) showPanel(e.target);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      stop();
    }
  }

  const listeners = [
    ["mousemove", onMove],
    ["pointerdown", onPick],
    ["mousedown", swallow],
    ["pointerup", swallow],
    ["mouseup", swallow],
    ["click", swallow],
    ["auxclick", swallow],
    ["keydown", onKey],
  ];

  function start() {
    state.host = el("div", { id: "locator-lens-root" });
    state.root = state.host.attachShadow({ mode: "open" });
    state.root.append(el("style", { text: STYLE }));
    state.layer = el("div", { class: "layer", "data-layer": "outlines" });
    state.hoverBox = el("div", { class: "hover", hidden: true });
    state.tip = el("div", { class: "tip", hidden: true, role: "status" });
    state.layer.append(state.hoverBox, state.tip);
    state.root.append(state.layer);
    document.documentElement.append(state.host);
    for (const [type, fn] of listeners) window.addEventListener(type, fn, true);
    window.addEventListener("scroll", redraw, true);
    window.addEventListener("resize", redraw);
    state.on = true;
    drawOutlines();
  }

  function stop() {
    for (const [type, fn] of listeners) window.removeEventListener(type, fn, true);
    window.removeEventListener("scroll", redraw, true);
    window.removeEventListener("resize", redraw);
    cancelAnimationFrame(state.raf);
    state.host?.remove();
    Object.assign(state, { on: false, host: null, root: null, layer: null, hoverBox: null, tip: null,
      panel: null, hovered: null });
  }

  globalThis.__locatorLens = { toggle: () => (state.on ? stop() : start()), isOn: () => state.on };
  start();
})();
