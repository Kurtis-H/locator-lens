// Builds locator-lens-<version>.zip for "Load unpacked" or the Web Store.
// Uses the system zip so there are no extra dependencies.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";

const { version } = JSON.parse(readFileSync("manifest.json", "utf8"));
const out = `locator-lens-${version}.zip`;
rmSync(out, { force: true });
execFileSync("zip", ["-rq", out, "manifest.json", "src", "icons", "LICENSE"], { stdio: "inherit" });
console.log(out);
