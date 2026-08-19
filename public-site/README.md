# kems.uk public site

This folder is the static public KEMS website. It is intentionally separate from the Node.js property dashboard in `public/` + `server.mjs`.

## IONOS production deployment

Production is hosted on the existing IONOS web-hosting package, with `kems.uk` linked to the webspace directory `/kems`.

Deployment is automated by `.github/workflows/deploy-kems-uk.yml`:

1. GitHub checks the public/private boundary.
2. Only the contents of `public-site/` are mirrored over SFTP.
3. `README.md` is excluded from the public webspace.
4. The remote target is fixed to `/kems`.
5. Files removed from `public-site/` are also removed from `/kems` so the live site cannot accumulate stale assets.

Required GitHub Actions secrets:

- `IONOS_SFTP_HOST`
- `IONOS_SFTP_USER`
- `IONOS_SFTP_PASSWORD`
- `IONOS_SFTP_PORT` is optional; port 22 is used when it is absent.

The workflow can be run manually from GitHub Actions and also deploys automatically whenever `public-site/**` changes on `main`.

The public site must never contain a Home Assistant URL, token, household telemetry endpoint or property-control API. Remote property access remains a separate authenticated security boundary.
