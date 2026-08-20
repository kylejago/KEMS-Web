import crypto from "node:crypto";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const readBytes = (file) => fs.readFileSync(file);
const expect = (condition, message) => { if (!condition) throw new Error(message); };
const SHA256 = "67ad8c3ee349a35de23f5a9040ce27c18b5cf347454f777cf1f55a6f905eb01f";
const BYTES = 2_156_120;
const SOURCE_PATH = "docs/assets/kems_full_brand_concept.png";

const pkg = JSON.parse(read("package.json"));
const project = JSON.parse(read("config/project.json"));
const sync = read("scripts/sync-approved-logo.mjs");
const worker = read("public/service-worker.js");
const propertyLockup = read("public/brand-lockup.svg");
const publicLockup = read("public-site/brand-lockup.svg");
const propertyIcon = read("public/logo.svg");
const publicIcon = read("public-site/logo.svg");
const installer = read("install.sh");
const release = read(".github/workflows/release.yml");
const deploy = read(".github/workflows/deploy-kems-uk.yml");
const helper = read("deploy/remote-access-service.mjs");
const firstBoot = read("image/kems-setup-status.mjs");

expect(pkg.version === "0.7.0-alpha7-web.18", "package.json must identify Web.18");
expect(project.version === pkg.version, "project.json and package.json version drift");
expect(pkg.scripts.test.includes("web18-approved-brand-test.mjs"), "Web.18 approved-brand regression must be in npm test");
expect(pkg.scripts.test.startsWith("npm run sync-brand"), "Web.18 tests must sync the approved artwork before validation");

for (const marker of [
  SOURCE_PATH,
  SHA256,
  "2_156_120",
  "public/approved-logo.png",
  "public-site/approved-logo.png"
]) expect(sync.includes(marker), `approved-artwork sync contract missing ${marker}`);

const propertyPng = readBytes("public/approved-logo.png");
const publicPng = readBytes("public-site/approved-logo.png");
expect(propertyPng.length === BYTES, `property approved artwork must be ${BYTES} bytes`);
expect(publicPng.length === BYTES, `public approved artwork must be ${BYTES} bytes`);
expect(crypto.createHash("sha256").update(propertyPng).digest("hex") === SHA256, "property approved artwork SHA-256 mismatch");
expect(crypto.createHash("sha256").update(publicPng).digest("hex") === SHA256, "public approved artwork SHA-256 mismatch");
expect(propertyPng.equals(publicPng), "property and kems.uk approved PNGs must be byte-identical");

expect(propertyLockup === publicLockup, "property and kems.uk wide wrappers must be byte-identical");
expect(propertyIcon === publicIcon, "property and kems.uk compact wrappers must be byte-identical");
for (const wrapper of [propertyLockup, propertyIcon]) {
  expect(wrapper.includes("approved-logo.png"), "brand wrapper must use the exact approved PNG");
  expect(!/<(?:path|polygon|polyline|circle|rect|text|linearGradient)\b/i.test(wrapper), "Web.18 brand wrappers must not redraw KEMS artwork");
}
expect(propertyLockup.includes('viewBox="240 285 1040 370"'), "wide lockup crop must remain mechanically defined");
expect(propertyIcon.includes('viewBox="250 265 410 410"'), "compact icon crop must remain mechanically defined");

const propertyPages = ["public/index.html", "public/products.html", "public/agile.html", "public/compare.html", "public/remote-access.html"];
for (const file of propertyPages) {
  const text = read(file);
  expect(text.includes("brand-lockup.svg?v=alpha7web18"), `${file} must use the Web.18 approved lockup`);
  expect(!text.includes("alpha7web17") && !text.includes("alpha7web16"), `${file} still references an older branded shell`);
}
const publicPages = ["public-site/index.html", "public-site/demo.html", "public-site/login.html", "public-site/privacy.html", "public-site/404.html"];
for (const file of publicPages) {
  const text = read(file);
  expect(text.includes("brand-lockup.svg?v=alpha7web18"), `${file} must use the Web.18 approved lockup`);
  expect(text.includes("styles.css?v=alpha7web18"), `${file} must force the Web.18 public stylesheet`);
  expect(!text.includes("alpha7web17") && !text.includes("alpha7web16"), `${file} still references an older branded shell`);
}

expect(firstBoot.includes(SOURCE_PATH), "Pi first-boot screen must use the exact approved KEMS source image");
expect(firstBoot.includes('viewBox=\"240 285 1040 370\"'), "Pi first-boot artwork must use the same mechanical wide crop");
expect(!firstBoot.includes("linearGradient id=\"word\""), "Pi first-boot must not retain the redrawn KEMS mark");
expect(worker.includes('const CACHE_NAME = "kems-alpha7-web18-shell-v1"'), "Web.18 must advance the PWA cache");
expect(worker.includes("/approved-logo.png?v=alpha7web18"), "PWA shell must cache the exact approved artwork");
expect(installer.includes("sync-approved-logo.mjs") && installer.includes("approved-logo.png"), "fresh Pi install must prepare the approved artwork");
expect(release.includes("approved-logo.png") && release.includes(SHA256), "release workflow must verify the approved artwork");
expect(deploy.includes("sync-approved-logo.mjs") && deploy.includes("public-site/approved-logo.png"), "kems.uk deployment must prepare approved artwork");
expect(helper.includes('const HELPER_VERSION = "0.7.0-alpha7-web.18"'), "Remote Access helper must align with Web.18");

console.log("Web.18 exact approved KEMS artwork contract passed.");
