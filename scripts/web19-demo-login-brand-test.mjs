import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const propertyAssetVersion = "build1";
const publicAssetVersion = "site1";
const pkg = JSON.parse(read("package.json"));

const publicIndex = read("public-site/index.html");
const demo = read("public-site/demo.html");
const compare = read("public-site/demo-compare.html");
const login = read("public-site/login.html");
const privacy = read("public-site/privacy.html");
const notFound = read("public-site/404.html");
const publicCss = read("public-site/site.css");
const brand = read("public/brand-lockup.svg");
const logo = read("public/logo.svg");

expect(publicIndex.includes("kems.uk"), "public homepage must identify kems.uk");
expect(publicIndex.includes("See KEMS in action"), "public homepage must expose delayed KEMS demo");
expect(publicIndex.includes("Sign in"), "public homepage must expose property sign-in");
expect(publicIndex.includes("Home Assistant remains private"), "public homepage must state HA privacy boundary");
expect(publicIndex.includes(`site.css?v=${publicAssetVersion}`), "public homepage must use neutral site cache key");
expect(demo.includes(`site.css?v=${publicAssetVersion}`), "public demo must use neutral site cache key");
expect(compare.includes(`site.css?v=${publicAssetVersion}`), "public comparison must use neutral site cache key");
expect(login.includes(`site.css?v=${publicAssetVersion}`), "public login must use neutral site cache key");
expect(privacy.includes(`site.css?v=${publicAssetVersion}`), "public privacy page must use neutral site cache key");
expect(notFound.includes(`site.css?v=${publicAssetVersion}`), "public 404 must use neutral site cache key");
expect(!/(?:alpha7web|alpha8web)/i.test(publicIndex + demo + compare + login + privacy + notFound + publicCss), "public site must not embed development-generation cache identity");

expect(brand.includes("KEMS"), "property brand lockup must identify KEMS");
expect(logo.includes('viewBox="0 0 180 180"'), "canonical KEMS logo viewBox missing");
expect(logo.includes('aria-label="KEMS logo"'), "canonical KEMS logo accessibility label missing");
expect(!brand.includes("approved-logo.png"), "brand lockup must not use obsolete PNG concept");

expect(demo.includes("7 days"), "public demo must preserve seven-day delay copy");
expect(compare.includes("Live Data") && compare.includes("KEMS"), "public comparison must preserve two-product labels");
expect(login.includes("Cloudflare"), "public login must explain Cloudflare sign-in");
expect(login.includes("what you are allowed"), "public login must explain property authorisation boundary");
expect(
  !/<input[^>]+type=["']?password/i.test(login),
  "kems.uk must not implement password form",
);

const worker = read("public/service-worker.js");
expect(
  worker.includes("kems-web-shell-build1"),
  "current Web release must use the neutral PWA build cache",
);
expect(
  worker.includes(`/brand-lockup.svg?v=${propertyAssetVersion}`),
  "PWA must cache current brand lockup",
);
expect(!worker.includes("approved-logo.png"), "PWA must not cache obsolete PNG concept");
const propertyPages = [
  "public/index.html",
  "public/products.html",
  "public/kems.html",
  "public/compare.html",
  "public/remote-access.html",
  "public/performance.html",
  "public/settings.html",
];
for (const file of propertyPages) {
  const text = read(file);
  expect(
    text.includes(propertyAssetVersion),
    `${file} must use current neutral property assets`,
  );
  expect(
    !/(?:alpha7web|alpha8web)/i.test(text),
    `${file} must not embed development-generation cache identity`,
  );
}

const legacyAgile = read("public/agile.html");
expect(legacyAgile.includes("/kems.html"), "legacy Agile URL must redirect to canonical KEMS route");
expect(!legacyAgile.includes(propertyAssetVersion), "legacy Agile redirect must not start a second property asset shell");
expect(!/agile-page\.js|web21-agile\.js|id="agile-app"/.test(legacyAgile), "legacy Agile redirect must not start a dashboard renderer");

const publicPages = [
  "public-site/index.html",
  "public-site/demo.html",
  "public-site/demo-compare.html",
  "public-site/login.html",
  "public-site/privacy.html",
  "public-site/404.html",
];
for (const file of publicPages) {
  const text = read(file);
  expect(
    text.includes(publicAssetVersion),
    `${file} must use current neutral public assets`,
  );
  expect(
    !/(?:alpha7web|alpha8web)/i.test(text),
    `${file} must not embed development-generation cache identity`,
  );
}

console.log(`${pkg.version} exact SVG, canonical delayed demo and Cloudflare login contract passed.`);
