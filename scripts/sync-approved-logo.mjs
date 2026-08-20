import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE_URL = process.env.KEMS_APPROVED_LOGO_URL || "https://raw.githubusercontent.com/kylejago/KEMS/main/docs/assets/kems_full_brand_concept.png";
const EXPECTED_SHA256 = "67ad8c3ee349a35de23f5a9040ce27c18b5cf347454f777cf1f55a6f905eb01f";
const EXPECTED_BYTES = 2_156_120;
const DESTINATIONS = [
  path.join(ROOT, "public", "approved-logo.png"),
  path.join(ROOT, "public-site", "approved-logo.png")
];

function validExisting(file) {
  try {
    const data = fs.readFileSync(file);
    return data.length === EXPECTED_BYTES && crypto.createHash("sha256").update(data).digest("hex") === EXPECTED_SHA256;
  } catch {
    return false;
  }
}

if (DESTINATIONS.every(validExisting)) {
  console.log("Approved KEMS artwork already present and verified.");
  process.exit(0);
}

const response = await fetch(SOURCE_URL, {
  headers: { "User-Agent": "KEMS-Web-approved-brand-sync" },
  signal: AbortSignal.timeout(30_000)
});
if (!response.ok) throw new Error(`Approved KEMS artwork download failed: HTTP ${response.status}`);
const data = Buffer.from(await response.arrayBuffer());
const sha256 = crypto.createHash("sha256").update(data).digest("hex");
if (data.length !== EXPECTED_BYTES) throw new Error(`Approved KEMS artwork size mismatch: ${data.length}`);
if (sha256 !== EXPECTED_SHA256) throw new Error(`Approved KEMS artwork SHA-256 mismatch: ${sha256}`);

for (const file of DESTINATIONS) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data, { mode: 0o644 });
}
console.log(`Synced exact approved KEMS artwork (${data.length} bytes, ${sha256}).`);
