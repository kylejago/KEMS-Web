import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE = path.join(ROOT, "brand", "kems-logo.svg");
const EXPECTED_SHA256 = "ef53e22bdff4e4ebd81007c3a6d5f28da0384f547e9036a7be7e3bf2d420b464";
const EXPECTED_BYTES = 877;
const DESTINATIONS = [
  path.join(ROOT, "public", "logo.svg"),
  path.join(ROOT, "public", "brand-lockup.svg"),
  path.join(ROOT, "public-site", "logo.svg"),
  path.join(ROOT, "public-site", "brand-lockup.svg")
];

const data = fs.readFileSync(SOURCE);
const sha256 = crypto.createHash("sha256").update(data).digest("hex");
if (data.length !== EXPECTED_BYTES) throw new Error(`Canonical KEMS SVG size mismatch: ${data.length}`);
if (sha256 !== EXPECTED_SHA256) throw new Error(`Canonical KEMS SVG SHA-256 mismatch: ${sha256}`);

for (const file of DESTINATIONS) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data, { mode: 0o644 });
}
console.log(`Synced exact KEMS SVG (${data.length} bytes, ${sha256}).`);
