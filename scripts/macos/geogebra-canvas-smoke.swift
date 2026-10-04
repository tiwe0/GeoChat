import AppKit
import Foundation
import WebKit

private let resultPrefix = "GEOGEBRA_CANVAS_SMOKE_RESULT "

private struct Options {
    let bundleRoot: URL
    let contentSecurityPolicy: String
    let withoutNonce: Bool
}

private struct BundleManifest: Decodable {
    struct Asset: Decodable { let path: String }
    let assets: [Asset]
}

private final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private let bundleRoot: URL
    private let allowedPaths: Set<String>
    private let html: Data
    private let policy: String
    private(set) var servedAssetCount = 0
    private(set) var missingAssetCount = 0

    init(bundleRoot: URL, allowedPaths: Set<String>, html: String, policy: String) {
        self.bundleRoot = bundleRoot
        self.allowedPaths = allowedPaths
        self.html = Data(html.utf8)
        self.policy = policy
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            respond(urlSchemeTask, status: 400, mimeType: "text/plain", body: Data())
            return
        }
        let path = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if path == "smoke/index.html" {
            respond(urlSchemeTask, status: 200, mimeType: "text/html", body: html, includePolicy: true)
            return
        }
        guard isSafeRelativePath(path), allowedPaths.contains(path) else {
            missingAssetCount += 1
            respond(urlSchemeTask, status: 404, mimeType: "text/plain", body: Data())
            return
        }
        let resolvedRoot = bundleRoot.resolvingSymlinksInPath()
        let file = bundleRoot.appendingPathComponent(path).resolvingSymlinksInPath()
        guard file.path.hasPrefix(resolvedRoot.path + "/"), let data = try? Data(contentsOf: file) else {
            missingAssetCount += 1
            respond(urlSchemeTask, status: 404, mimeType: "text/plain", body: Data())
            return
        }
        servedAssetCount += 1
        respond(urlSchemeTask, status: 200, mimeType: mimeType(path), body: data)
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private func respond(
        _ task: WKURLSchemeTask,
        status: Int,
        mimeType: String,
        body: Data,
        includePolicy: Bool = false
    ) {
        guard let url = task.request.url else { return }
        var headers = ["Content-Type": mimeType, "X-Content-Type-Options": "nosniff"]
        if includePolicy { headers["Content-Security-Policy"] = policy }
        let response = HTTPURLResponse(
            url: url,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: headers
        )!
        task.didReceive(response)
        task.didReceive(body)
        task.didFinish()
    }
}

private final class SmokeController: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    private let options: Options
    private let schemeHandler: BundleSchemeHandler
    private let documentHTML: String
    private var webView: WKWebView!
    private var window: NSWindow!
    private var timeout: Timer?
    private var finished = false
    private var cspViolationCount = 0

    init(options: Options, allowedPaths: Set<String>) {
        self.options = options
        let nonce = options.withoutNonce ? nil : (0..<2).map { _ in
            UUID().uuidString.replacingOccurrences(of: "-", with: "")
        }.joined()
        let policy = nonce.map { policyWithNonce(options.contentSecurityPolicy, nonce: $0) }
            ?? options.contentSecurityPolicy
        let documentHTML = smokeHTML
        self.documentHTML = documentHTML
        self.schemeHandler = BundleSchemeHandler(
            bundleRoot: options.bundleRoot,
            allowedPaths: allowedPaths,
            html: documentHTML,
            policy: policy
        )
        super.init()

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.setURLSchemeHandler(schemeHandler, forURLScheme: "geochat-bundle")
        configuration.userContentController.add(self, name: "geochatSmoke")
        configuration.userContentController.addUserScript(WKUserScript(
            source: smokeBootstrap(nonce: nonce),
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        ))
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 900, height: 620), configuration: configuration)
        webView.navigationDelegate = self
        window = NSWindow(
            contentRect: NSRect(x: 1, y: 1, width: 900, height: 620),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        window.alphaValue = 0.01
        window.collectionBehavior = [.transient, .ignoresCycle]
        window.contentView = webView
    }

    func run() {
        timeout = Timer.scheduledTimer(withTimeInterval: 35, repeats: false) { [weak self] _ in
            self?.finish(status: "failed", reason: "timeout", exitCode: 1)
        }
        window.orderFrontRegardless()
        webView.load(URLRequest(url: URL(string: "geochat-bundle://localhost/smoke/index.html")!))
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let kind = body["kind"] as? String else {
            finish(status: "failed", reason: "invalid-message", exitCode: 1)
            return
        }
        switch kind {
        case "csp-violation":
            cspViolationCount += 1
            finish(status: "failed", reason: "csp-violation", exitCode: 2)
        case "ready":
            guard schemeHandler.missingAssetCount == 0,
                  (body["commandValidated"] as? Bool) == true,
                  (body["drawingCanvas"] as? Bool) == true else {
                let reason = schemeHandler.missingAssetCount == 0 ? "functional-check-failed" : "missing-resource"
                finish(status: "failed", reason: reason, exitCode: 1)
                return
            }
            finish(status: "complete", reason: nil, exitCode: 0)
        case "error":
            finish(status: "failed", reason: body["reason"] as? String ?? "javascript-error", exitCode: 1)
        default:
            finish(status: "failed", reason: "unknown-message", exitCode: 1)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish(status: "failed", reason: "navigation-failed", exitCode: 1)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish(status: "failed", reason: "navigation-failed", exitCode: 1)
    }

    private func finish(status: String, reason: String?, exitCode: Int32) {
        guard !finished else { return }
        finished = true
        timeout?.invalidate()
        webView.stopLoading()
        window.orderOut(nil)
        window.close()
        var evidence: [String: Any] = [
            "kind": "geochat-geogebra-canvas-smoke-evidence",
            "status": status,
            "withoutNonce": options.withoutNonce,
            "cspViolationCount": cspViolationCount,
            "servedAssetCount": schemeHandler.servedAssetCount,
            "missingAssetCount": schemeHandler.missingAssetCount,
            "appletReady": status == "complete",
            "drawingCanvas": status == "complete",
            "commandValidated": status == "complete"
        ]
        if let reason { evidence["reason"] = reason }
        let data = try! JSONSerialization.data(withJSONObject: evidence, options: [.sortedKeys])
        print(resultPrefix + String(data: data, encoding: .utf8)!)
        fflush(stdout)
        exit(exitCode)
    }
}

private let smokeHTML = """
<!doctype html>
<html><head><meta charset="utf-8"><title>GeoGebra canvas smoke</title></head>
<body><div id="geogebra-smoke-host" style="width:900px;height:620px"></div></body></html>
"""

private func policyWithNonce(_ policy: String, nonce: String) -> String {
    let directives = policy.split(separator: ";", omittingEmptySubsequences: false).map(String.init)
    return directives.map { directive in
        let trimmed = directive.trimmingCharacters(in: .whitespaces)
        guard trimmed.hasPrefix("script-src ") else { return directive }
        return directive + " 'nonce-\(nonce)'"
    }.joined(separator: ";")
}

private func smokeBootstrap(nonce: String?) -> String {
    let nonceLiteral = nonce.map { "'\($0)'" } ?? "''"
    return """
    (() => {
      const send = (body) => window.webkit.messageHandlers.geochatSmoke.postMessage(body);
      document.addEventListener('securitypolicyviolation', (event) => {
        send({ kind: 'csp-violation', directive: event.effectiveDirective || 'unknown' });
      }, true);
      window.addEventListener('error', (event) => {
        send({ kind: 'error', reason: event.target instanceof HTMLScriptElement ? 'script-load-failed' : 'javascript-error' });
      }, true);
      window.addEventListener('unhandledrejection', () => send({ kind: 'error', reason: 'unhandled-rejection' }));

      const nonce = \(nonceLiteral);
      const applyNonce = (element) => { if (nonce) element.setAttribute('nonce', nonce); return element; };
      const assetBase = 'geochat-bundle://localhost/vendor/geogebra';
      const codebase = assetBase + '/HTML5/5.0/web3d/';
      const meta = document.createElement('meta');
      meta.name = 'web3d::gwt:property';
      meta.content = 'baseUrl=' + codebase;
      document.head.appendChild(meta);
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = assetBase + '/HTML5/5.0/css/bundles/bundle.css';
      document.head.appendChild(stylesheet);
      const deploy = applyNonce(document.createElement('script'));
      deploy.src = assetBase + '/deployggb.js';
      deploy.onerror = () => send({ kind: 'error', reason: 'deployggb-load-failed' });
      deploy.onload = () => {
        if (typeof window.GGBApplet !== 'function') {
          send({ kind: 'error', reason: 'deployggb-api-missing' });
          return;
        }
        const applet = new window.GGBApplet(5.0, {
          id: 'geogebra-smoke-host', width: 900, height: 620, appName: 'classic',
          perspective: 'G', showToolBar: false, showMenuBar: false,
          showAlgebraInput: false, enableFileFeatures: false,
          appletOnLoad(api) {
            try {
              const accepted = api.evalCommand('A=(1,2)');
              const x = Number(api.getXcoord('A'));
              const y = Number(api.getYcoord('A'));
              const commandValidated = accepted !== false && Math.abs(x - 1) < 0.000001 && Math.abs(y - 2) < 0.000001;
              const deadline = Date.now() + 5000;
              const inspectCanvas = () => {
                const canvases = [...document.querySelectorAll('#geogebra-smoke-host .GeoGebraFrame canvas')];
                const drawingCanvas = canvases.some((canvas) => canvas.width > 0 && canvas.height > 0);
                if (drawingCanvas || Date.now() >= deadline) {
                  send({ kind: 'ready', commandValidated, drawingCanvas });
                } else {
                  setTimeout(inspectCanvas, 50);
                }
              };
              inspectCanvas();
            } catch (_) {
              send({ kind: 'error', reason: 'geogebra-command-failed' });
            }
          }
        });
        applet.setHTML5Codebase(codebase, true);
        applet.inject('geogebra-smoke-host', 'html5', true);
      };
      document.head.appendChild(deploy);
    })();
    """
}

private func isSafeRelativePath(_ path: String) -> Bool {
    !path.isEmpty && !path.hasPrefix("/") && !path.contains("\\") &&
        path.split(separator: "/").allSatisfy { $0 != "." && $0 != ".." && !$0.contains(":") }
}

private func mimeType(_ path: String) -> String {
    if path.hasSuffix(".html") { return "text/html; charset=utf-8" }
    if path.hasSuffix(".js") || path.hasSuffix(".mjs") { return "text/javascript; charset=utf-8" }
    if path.hasSuffix(".css") { return "text/css; charset=utf-8" }
    if path.hasSuffix(".json") || path.hasSuffix(".map") { return "application/json" }
    if path.hasSuffix(".svg") { return "image/svg+xml" }
    if path.hasSuffix(".png") { return "image/png" }
    if path.hasSuffix(".jpg") || path.hasSuffix(".jpeg") { return "image/jpeg" }
    if path.hasSuffix(".webp") { return "image/webp" }
    if path.hasSuffix(".wasm") { return "application/wasm" }
    if path.hasSuffix(".woff2") { return "font/woff2" }
    return "application/octet-stream"
}

private func parseOptions() throws -> Options {
    var values = Array(CommandLine.arguments.dropFirst())
    var bundleRoot: String?
    var cspBase64: String?
    var withoutNonce = false
    while !values.isEmpty {
        let flag = values.removeFirst()
        switch flag {
        case "--bundle-root":
            guard !values.isEmpty else { throw SmokeError.invalidArguments }
            bundleRoot = values.removeFirst()
        case "--csp-base64":
            guard !values.isEmpty else { throw SmokeError.invalidArguments }
            cspBase64 = values.removeFirst()
        case "--without-nonce":
            withoutNonce = true
        default:
            throw SmokeError.invalidArguments
        }
    }
    guard let bundleRoot, let cspBase64,
          let policyData = Data(base64Encoded: cspBase64),
          let policy = String(data: policyData, encoding: .utf8) else {
        throw SmokeError.invalidArguments
    }
    return Options(bundleRoot: URL(fileURLWithPath: bundleRoot).standardizedFileURL,
                   contentSecurityPolicy: policy, withoutNonce: withoutNonce)
}

private enum SmokeError: Error { case invalidArguments, invalidManifest }

do {
    let options = try parseOptions()
    let manifestURL = options.bundleRoot.appendingPathComponent("app-bundle-manifest.json")
    let manifest = try JSONDecoder().decode(BundleManifest.self, from: Data(contentsOf: manifestURL))
    let paths = Set(manifest.assets.map(\.path))
    guard paths.contains("vendor/geogebra/deployggb.js"),
          paths.contains("vendor/geogebra/HTML5/5.0/web3d/web3d.nocache.js") else {
        throw SmokeError.invalidManifest
    }
    let app = NSApplication.shared
    app.setActivationPolicy(.prohibited)
    app.finishLaunching()
    let controller = SmokeController(options: options, allowedPaths: paths)
    DispatchQueue.main.async { controller.run() }
    app.run()
} catch {
    let evidence: [String: Any] = [
        "kind": "geochat-geogebra-canvas-smoke-evidence",
        "status": "failed",
        "reason": "setup-failed"
    ]
    let data = try! JSONSerialization.data(withJSONObject: evidence, options: [.sortedKeys])
    print(resultPrefix + String(data: data, encoding: .utf8)!)
    exit(1)
}
