import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

describe("manifest", () => {
  it("is Manifest V3", () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it("asks only for what it needs: no host access, no always-on content scripts", () => {
    // activeTab means it can only touch a page after you click it there.
    expect(manifest.permissions).toEqual(["activeTab", "scripting", "clipboardWrite"]);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.web_accessible_resources).toBeUndefined();
    expect(manifest.externally_connectable).toBeUndefined();
  });

  it("points only at files that exist", () => {
    const files = [
      manifest.background.service_worker,
      ...Object.values(manifest.icons),
      ...Object.values(manifest.action.default_icon),
    ];
    for (const f of files) expect(existsSync(new URL(f, root)), f).toBe(true);
  });

  it("injects the files the service worker names", () => {
    const sw = readFileSync(new URL(manifest.background.service_worker, root), "utf8");
    for (const f of sw.match(/"src\/[^"]+\.js"/g).map((s) => s.slice(1, -1))) {
      expect(existsSync(new URL(f, root)), f).toBe(true);
    }
  });

  it("keeps its version in step with package.json", () => {
    expect(manifest.version).toBe(pkg.version);
  });
});
