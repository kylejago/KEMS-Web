# kems.uk public site

This folder is the static public KEMS website. It is intentionally separate from the Node.js property dashboard in `public/` + `server.mjs`.

## IONOS

Recommended deployment: IONOS Deploy Now connected to `kylejago/KEMS-Web` with the production output/dist folder set to `public-site`. No build command is required.

Alternatively, upload only the contents of this folder to the IONOS webspace assigned to `kems.uk` over SFTP.

The public site must never contain a Home Assistant URL, token, household telemetry endpoint or property-control API. Remote property access is a separate future security boundary.
