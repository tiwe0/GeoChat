import { describe, expect, test } from "bun:test";
import { geogebraAssetBaseUrl } from "../src/renderer-react/src/geogebra/ggbdeploy-wrapper";

describe("GeoGebra packaged asset boundary", () => {
  test("uses the authenticated loopback backend only in development", () => {
    expect(geogebraAssetBaseUrl(
      "http://127.0.0.1:17365/",
      "http://127.0.0.1:1421/index.html",
      true
    )).toBe("http://127.0.0.1:17365/tools/geogebra-assets-v2");
  });

  test("uses the verified app bundle protocol in packaged builds", () => {
    expect(geogebraAssetBaseUrl(
      "http://127.0.0.1:17365",
      "geochat-bundle://localhost/renderer/index.html",
      false
    )).toBe("geochat-bundle://localhost/vendor/geogebra");
    expect(geogebraAssetBaseUrl(
      "http://127.0.0.1:17365",
      "http://geochat-bundle.localhost/renderer/index.html",
      false
    )).toBe("http://geochat-bundle.localhost/vendor/geogebra");
  });
});
