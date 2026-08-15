import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("build emits a static fallback that redirects unknown routes to root", () => {
  assert.equal(existsSync("dist/404.html"), true);
  const html = readFileSync("dist/404.html", "utf8");
  assert.match(html, /location\.replace\(["']\/["']\)/);
  assert.match(html, /href=["']\/["']/);
});

test("build emits only normalized aliases for an accented guest name", () => {
  assert.equal(existsSync("dist/lara-espanola/index.html"), true);
  assert.equal(existsSync("dist/laraespanola/index.html"), true);
  assert.equal(existsSync("dist/LaraEspaola/index.html"), false);
});
