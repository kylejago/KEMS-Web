import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const webNumber = Number.parseInt(pkg.version.match(/-web\.(\d+)$/)?.[1] || "0", 10);
const assetVersion = `alpha7web${webNumber}`;

assert.ok(webNumber >= 31, `Expected Web.31 or later, got ${pkg.version}`);

const manifestText = read("public/site.webmanifest");
const manifest = JSON.parse(manifestText);
assert.equal(manifest.start_url, webNumber >= 32 ? "/#live" : "/");
assert.equal(manifest.scope, "/");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.prefer_related_applications, false);
assert.doesNotMatch(manifestText, /alpha7web21|logo\.svg/);
assert.ok(manifest.icons.some((icon) => icon.src.includes("kems-192.png") && icon.sizes === "192x192"));
assert.ok(manifest.icons.some((icon) => icon.src.includes("kems-512.png") && icon.sizes === "512x512"));
assert.ok(manifest.icons.some((icon) => icon.src.includes("kems-maskable-512.png") && icon.purpose === "maskable"));

for (const file of [
  "public/index.html",
  "public/compare.html",
  "public/agile.html",
  "public/performance.html",
  "public/settings.html",
]) {
  const html = read(file);
  assert.match(html, /viewport-fit=cover/, `${file} must support mobile safe areas`);
  assert.match(html, /mobile-web-app-capable/, `${file} must opt into installed app mode`);
  assert.match(html, /apple-mobile-web-app-capable/, `${file} must support iOS home-screen mode`);
  assert.match(html, new RegExp(`icons/kems-192\\.png\\?v=${assetVersion}`));
  assert.match(html, new RegExp(`mobile-pwa\\.css\\?v=${assetVersion}`));
  assert.match(html, new RegExp(`pwa-bootstrap\\.js\\?v=${assetVersion}`));
}

const worker = read("public/service-worker.js");
for (const marker of [
  `kems-alpha7-web${webNumber}-shell-v1`,
  `mobile-pwa.css?v=${assetVersion}`,
  `pwa-bootstrap.js?v=${assetVersion}`,
  `icons/kems-192.png?v=${assetVersion}`,
  `icons/kems-512.png?v=${assetVersion}`,
  `icons/kems-maskable-512.png?v=${assetVersion}`,
  "isSameOriginResponse",
  "isAccessRedirect",
  "response.redirected",
  "opaqueredirect",
  "KEMS_AUTH_REQUIRED",
  "authRequired: true",
  "cache-control",
  'url.pathname.startsWith("/api/")',
]) {
  assert.match(worker, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.doesNotMatch(worker, /cache\.addAll\(/, "PWA install must not blindly cache redirected Access responses");

const bootstrap = read("public/pwa-bootstrap.js");
for (const marker of [
  "KEMSPWA",
  "beforeinstallprompt",
  "appinstalled",
  "navigator.serviceWorker",
  'register("/service-worker.js"',
  "registration.update()",
  "KEMS_AUTH_REQUIRED",
  "KEMS session expired",
  "Sign in again",
  "window.location.reload()",
  'window.addEventListener("online"',
  'window.addEventListener("offline"',
]) {
  assert.match(bootstrap, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

const mobileCss = read("public/mobile-pwa.css");
for (const marker of [
  "safe-area-inset-bottom",
  "safe-area-inset-top",
  ".kems-auth-banner",
  "min-height: 48px",
  "@media (display-mode: standalone)",
]) {
  assert.match(mobileCss, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

console.log(`Web.${webNumber} mobile/PWA contract passed: install icons, safe-area shell, shared worker bootstrap and Cloudflare Access cache guard are present.`);
