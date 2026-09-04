// Compatibility sentinel for KEMS Web appliance updaters shipped before Web.10.
//
// Older installed kems-update scripts syntax-check public/app.js before they
// activate a downloaded release. The legacy Alpha6 renderer that previously
// lived here is intentionally gone; current KEMS pages do not import or load
// this file. Keep this module inert so older appliances can install the release
// that replaces their updater with the canonical-runtime validation path.
export {};
