// Web.16 compatibility shim.
//
// Web.15 started the privileged Cloudflare setup helper from the Pi manager and
// exposed it on a second LAN port. Web.16 moves that helper into the dedicated
// root-owned kems-web-remote-access.service, bound only to 127.0.0.1:4175.
// The public KEMS gateway proxies the small allow-listed API over the existing
// local KEMS origin, so browsers never connect directly to a privileged port.

export function startRemoteAccessServer() {
  console.log("KEMS Web.16 remote-access setup is provided by kems-web-remote-access.service; manager compatibility hook is inactive.");
  return null;
}
