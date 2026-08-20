import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const pkg = JSON.parse(read("package.json"));
const project = JSON.parse(read("config/project.json"));
const updater = read("deploy/bin/kems-update");
const installer = read("install.sh");
const helper = read("deploy/remote-access-service.mjs");
const helperUnit = read("deploy/systemd/kems-web-remote-access.service");
const worker = read("public/service-worker.js");
const brandCss = read("public/brand.css");
const propertyLockup = read("public/brand-lockup.svg");
const publicLockup = read("public-site/brand-lockup.svg");
const propertyIcon = read("public/logo.svg");
const publicIcon = read("public-site/logo.svg");

const expect = (condition, message) => { if (!condition) throw new Error(message); };

expect(pkg.version === "0.7.0-alpha7-web.17", "package.json must identify Web.17");
expect(project.version === pkg.version, "project.json and package.json version drift");
expect(pkg.scripts.test.includes("web17-bootstrap-brand-test.mjs"), "Web.17 regression must run in npm test");

for (const marker of [
  'REMOTE_HELPER_URL="http://127.0.0.1:4175/health"',
  "one-time bootstrap repair",
  "systemctl restart kems-web-remote-access.service",
  'curl -fsS --max-time 2 "$REMOTE_HELPER_URL"',
  "Remote Access setup helper is healthy",
  "exit 8"
]) expect(updater.includes(marker), `Web.17 updater missing bootstrap marker: ${marker}`);
for (const marker of [
  "systemctl enable --now kems-web-remote-access.service",
  "http://127.0.0.1:4175/health",
  "Remote Access setup helper did not pass its loopback health check"
]) expect(installer.includes(marker), `fresh installer missing helper verification: ${marker}`);
expect(helper.includes('const HOST = "127.0.0.1"'), "Remote Access helper must stay loopback-only");
expect(helper.includes('const HELPER_VERSION = "0.7.0-alpha7-web.17"'), "Remote Access helper must identify Web.17");
expect(helperUnit.includes("User=root") && helperUnit.includes("remote-access-service.mjs"), "privileged helper systemd unit missing");

expect(worker.includes('const CACHE_NAME = "kems-alpha7-web17-shell-v1"'), "Web.17 must advance the PWA cache");
for (const marker of [
  "/brand.css?v=alpha7web17",
  "/brand-lockup.svg?v=alpha7web17",
  "/logo.svg?v=alpha7web17",
  "/remote-access.html"
]) expect(worker.includes(marker), `Web.17 PWA shell missing ${marker}`);
expect(brandCss.includes("brand-lockup") && brandCss.includes("loading-brand-lockup") && brandCss.includes("page-brand-lockup"), "canonical brand presentation stylesheet incomplete");

const propertyPages = ["public/index.html", "public/products.html", "public/agile.html", "public/compare.html", "public/remote-access.html"];
for (const file of propertyPages) {
  const text = read(file);
  expect(text.includes("brand-lockup.svg?v=alpha7web17"), `${file} does not use the canonical Web.17 lockup`);
  expect(!text.includes("alpha7web16"), `${file} still references Web.16 cached assets`);
}
expect(read("public/remote-access.html").includes("page-brand-lockup"), "Remote Access page must visibly show the canonical logo even outside the top bar");
expect(read("public/index.html").includes("loading-brand-lockup"), "dashboard loading state must use the canonical full lockup");
expect(read("public/agile.html").includes("loading-brand-lockup"), "Agile loading state must use the canonical full lockup");
expect(read("public/compare.html").includes("loading-brand-lockup"), "Compare loading state must use the canonical full lockup");

const publicPages = ["public-site/index.html", "public-site/demo.html", "public-site/login.html", "public-site/privacy.html", "public-site/404.html"];
for (const file of publicPages) {
  const text = read(file);
  expect(text.includes("brand-lockup.svg?v=alpha7web17"), `${file} does not use the canonical Web.17 lockup`);
  expect(text.includes("styles.css?v=alpha7web17"), `${file} does not force the Web.17 public brand stylesheet`);
}

expect(propertyLockup === publicLockup, "property and kems.uk canonical lockups must be byte-identical");
expect(propertyIcon === publicIcon, "property and kems.uk compact canonical icons must be byte-identical");
for (const marker of ["Kyle Energy Management System", "#ffbf00", "#075abf", "#36bd52", ">KEMS</"]) expect(propertyLockup.includes(marker), `canonical lockup missing ${marker}`);

console.log("Web.17 bootstrap repair + canonical-logo-everywhere contract passed.");
