# KEMS public delayed demo — Web.19

Web.19 turns the public demo into a real, deliberately delayed view of retained KEMS evidence without exposing the property dashboard or Home Assistant.

## Public route

Publish one additional Cloudflare Tunnel hostname from the same property Pi:

```text
demo-api.kems.uk -> HTTP -> http://localhost:4173
```

Do **not** attach the private-property Cloudflare Access application to this hostname. The KEMS gateway recognises `demo-api.kems.uk` and serves only:

```text
GET /api/public-demo
HEAD /api/public-demo
OPTIONS /api/public-demo
```

Every other path on the demo hostname returns 404. The private `kyle.kems.uk` property route continues to use Cloudflare Access and is unaffected.

## Privacy boundary

The API reads the Pi's retained daily `energy-ledger.json`, then applies a minimum seven-day date cutoff before serialising anything. It allow-lists daily aggregate energy/cost fields plus sanitised half-hour KEMS routing presentation fields only after the same minimum delay. Half-hour rows are limited to time, tariff price, estimated SOC, Grid/Solar/Battery route labels and their slot kWh. It does not return:

- live power or any sub-seven-day KEMS slot evidence;
- Home Assistant URLs or tokens;
- entity IDs;
- device identifiers;
- Pi-management data;
- Cloudflare tunnel credentials;
- control state or control endpoints.

The current ledger retains measured daily totals, while privacy-delayed Recorder evidence supplies the canonical KEMS bill contract and, when retained, the sanitised half-hour Agile flow presentation. Historical runtime gaps remain explicit NO DATA rather than being rewritten as zero activity.

The current ledger already retains measured daily totals plus the existing KEMS simulation. Web.19 publishes the existing simulation as **Full KEMS Agile** for historical rows where that is the retained model. Battery & Solar and Full KEMS columns appear only when product-specific daily evidence exists; the public feed never invents missing product results.

The static `kems.uk/demo.html` page requests `https://demo-api.kems.uk/api/public-demo` with `cache: no-store`. If that API is not configured or temporarily unavailable, it falls back to the bundled empty/static demo feed and explains the status rather than exposing another property endpoint.

## CORS

Only these public-site origins receive an `Access-Control-Allow-Origin` response:

```text
https://kems.uk
https://www.kems.uk
```

The demo API does not provide wildcard CORS.
