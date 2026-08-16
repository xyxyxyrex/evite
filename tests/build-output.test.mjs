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

test("build emits independent greeting glow and sparkle layers", () => {
  const html = readFileSync("dist/lara-espanola/index.html", "utf8");
  assert.match(html, /id="guest-writing-glow"/);
  assert.match(html, /id="guest-sparkle-canvas"/);
  assert.match(html, /aria-hidden="true"/);
});

test("landing emits the concise moonlit letter and layered portrait scene", () => {
  const html = readFileSync("dist/lara-espanola/index.html", "utf8");
  assert.match(html, /id="moonlit-letter"/);
  assert.match(html, /id="portrait-stage"/);
  assert.match(html, /id="scene-background"/);
  assert.match(html, /id="scene-magic-rear"/);
  assert.match(html, /id="scene-foreground"/);
  assert.match(html, /id="scene-magic-front"/);
  assert.match(html, /id="scene-background"[\s\S]*id="scene-magic-rear"[\s\S]*id="scene-foreground"[\s\S]*id="scene-magic-front"/);
  assert.match(html, /id="scene-motion-button"/);
  assert.match(html, /id="scene-motion-button"[^>]*type="button"/);
  assert.match(html, /id="scene-motion-button"[^>]*aria-label="Enable motion effect"/);
  assert.match(html, /id="scene-motion-status"[^>]*role="status"/);
  const heroScriptPath = html.match(/<script type="module" src="([^"]*HeroSection[^"]+\.js)"/)?.[1];
  assert.ok(heroScriptPath, "landing page references the HeroSection browser bundle");
  const heroScript = readFileSync(`dist${heroScriptPath}`, "utf8");
  assert.match(heroScript, /requestPermission/);
  assert.match(heroScript, /deviceorientation/);
  assert.match(html, /You are invited to:/i);
  assert.match(html, /Once Upon Eighteen/);
  assert.doesNotMatch(html, /An 18th Birthday Debut Celebration/);
  assert.doesNotMatch(html, /cordially requests your presence/);
  assert.doesNotMatch(html, /You are invited to my 18th Birthday Debut!/);
});

test("page stacks purple Vanta clouds between the image background and stars", () => {
  const html = readFileSync("dist/lara-espanola/index.html", "utf8");
  assert.match(html, /id="vanta-cloud-layer"[\s\S]*id="star-sparkle-layer"/);

  const cloudScriptPath = html.match(/<script type="module" src="([^"]*VantaCloudBackground[^"]+\.js)"/)?.[1];
  assert.ok(cloudScriptPath, "page references the Vanta cloud browser bundle");
  const cloudScript = readFileSync(`dist${cloudScriptPath}`, "utf8");
  assert.match(cloudScript, /gyroControls:!0|gyroControls:true/);

  const stylesheetPath = html.match(/<link rel="stylesheet" href="([^"]+\.css)"/)?.[1];
  assert.ok(stylesheetPath, "page references the generated stylesheet");
  const stylesheet = readFileSync(`dist${stylesheetPath}`, "utf8");
  assert.match(stylesheet, /#vanta-cloud-layer[^}]*opacity:\.?56/);
});

test("landing emits the enchanted unsealing layers", () => {
  const html = readFileSync("dist/lara-espanola/index.html", "utf8");
  assert.match(html, /id="opening-veil"/);
  assert.match(html, /class="letter-border-trace"/);
  assert.match(html, /class="unseal-motes"/);
});

test("long roster names emit a compact one-line greeting", () => {
  const longNameHtml = readFileSync("dist/johnezza-veronic-tolentino/index.html", "utf8");
  const typicalNameHtml = readFileSync("dist/lara-espanola/index.html", "utf8");

  assert.match(
    longNameHtml,
    /class="guest-name-text[^"]*guest-name-compact[^"]*" id="guest-name-reveal"[^>]*>Johnezza Veronic Tolentino</,
  );
  assert.doesNotMatch(typicalNameHtml, /guest-name-compact/);
});
