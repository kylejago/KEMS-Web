# kems.uk public site

`public-site/` is the static public KEMS website deployed to IONOS. It contains no Home Assistant credentials, property-control API or private Pi-management endpoint.

## Branding

The deployment workflow runs `scripts/sync-approved-logo.mjs`, which copies the exact user-supplied `brand/kems-logo.svg` into the public site and verifies SHA-256 `ef53e22bdff4e4ebd81007c3a6d5f28da0384f547e9036a7be7e3bf2d420b464`.

## Demo

`demo.html` loads deliberately delayed data from:

```text
https://demo-api.kems.uk/api/public-demo
```

That hostname is served by the property Pi through Cloudflare Tunnel, but the KEMS gateway exposes only the sanitised public-demo endpoint on that hostname. Data is daily aggregate evidence at least seven days old. If the API is unavailable, the page falls back to `demo-data.json` and reports the unavailable/live-feed state.

## Sign in

`login.html` sends users to the Cloudflare Access App Launcher:

```text
https://kems-uk.cloudflareaccess.com/
```

Cloudflare performs authentication and property authorisation. `kems.uk` does not maintain a separate password database.

## Deployment

The GitHub workflow `.github/workflows/deploy-kems-uk.yml` mirrors the contents of `public-site/` to the IONOS webspace. The public site may reference the deliberately public `demo-api.kems.uk/api/public-demo` endpoint; it must never contain Home Assistant tokens, `localhost:8123`, Pi manager port 4174 or Remote Access helper port 4175.
