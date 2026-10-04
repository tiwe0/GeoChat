import { readFileSync } from "node:fs";
import { join } from "node:path";

// These two upstream bootstrap paths must propagate the entry page's nonce.
// Fail the build after a vendor upgrade rather than silently shipping a broken
// CSP integration. The tiny patches live in vendor so dev and release agree.
export function assertGeoGebraNonceSources(bootstrap, runtime) {
  for (const [source, marker, name] of [
    [bootstrap, "var e=n.document.querySelector('script[nonce]');if(e){d.nonce=e.nonce||e.getAttribute('nonce')}d.text=a;", "GWT fragment installer"],
    [runtime, "vc(sid,c);sid.head.appendChild(c)", "GeoGebra library installer"],
  ]) {
    if (source.split(marker).length !== 2) {
      throw new Error(`GeoGebra nonce contract changed: ${name}. Review the vendor CSP integration before packaging.`);
    }
  }
}

export function assertGeoGebraNonceRuntime(root) {
  const module = join(root, "HTML5/5.0/web3d");
  assertGeoGebraNonceSources(
    readFileSync(join(module, "web3d.nocache.js"), "utf8"),
    readFileSync(join(module, "88D10604D04F201298F9DADF8F8ABD98.cache.js"), "utf8"),
  );
}
