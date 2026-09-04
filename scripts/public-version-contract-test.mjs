import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const publicVersion = JSON.parse(read("public-site/version.json"));
const deployWorkflow = read(".github/workflows/deploy-kems-uk.yml");
const releaseWorkflow = read(".github/workflows/release-public.yml");

assert.match(pkg.version, /^0\.9\.0-alpha9-web\.\d+$/);
assert.equal(publicVersion.product, "KEMS Public Web");
assert.match(publicVersion.version, /^0\.9\.0-alpha9-public\.\d+$/);
assert.notEqual(publicVersion.version, pkg.version, "Pi Web and Public Web must have independent version identities");
assert.equal(publicVersion.channel, "alpha");

assert.match(deployWorkflow, /public-site\/\*\*/);
assert.doesNotMatch(deployWorkflow, /- ["']?package\.json["']?/, "A Pi Web package-version change must not trigger a Public Web deployment");
assert.match(releaseWorkflow, /public-site\/version\.json/);
assert.match(releaseWorkflow, /public-v\*/);
assert.match(releaseWorkflow, /KEMS Public Web/);
assert.doesNotMatch(releaseWorkflow, /require\('\.\/package\.json'\)\.version/);

for (const file of [
  "public-site/index.html",
  "public-site/demo.html",
  "public-site/demo-compare.html",
  "public-site/login.html",
  "public-site/privacy.html",
  "public-site/404.html",
]) {
  const source = read(file);
  assert.doesNotMatch(source, /HA_TOKEN|long-lived access token|localhost:8123|\/api\/services/i);
}

console.log(`KEMS Public Web ${publicVersion.version} contract passed: independent versioning/release identity and public/private boundary are intact.`);
