//  UDCI GMP Manufacturing Suite — native iOS wrapper
//  Upstate Diabetes Cure Initiative · SUNY Centre for Advanced Cell Therapy
//
//  Loads the bundled web app through a custom URL scheme (udci://app/…), which
//  WebKit treats as a secure origin — so IndexedDB, WebCrypto and storage work
//  reliably. A small message bridge turns the app's "Export backup" / open-file
//  actions into a native iOS share sheet.

import SwiftUI
import WebKit
import UIKit

@main
struct UDCIGMPSuiteApp: App {
    var body: some Scene {
        WindowGroup {
            WebView()
                .ignoresSafeArea()
                .preferredColorScheme(.dark)
        }
    }
}

// Serves files from the bundled `web/` folder under the udci:// scheme.
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
    let root: URL
    init(root: URL) { self.root = root }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { task.didFailWithError(URLError(.badURL)); return }
        var rel = url.path
        if rel.hasPrefix("/") { rel.removeFirst() }
        if rel.isEmpty { rel = "index.html" }
        let fileURL = root.appendingPathComponent(rel)
        guard let data = try? Data(contentsOf: fileURL) else { task.didFailWithError(URLError(.fileDoesNotExist)); return }
        let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                   headerFields: ["Content-Type": Self.mime(for: fileURL.pathExtension),
                                                  "Cache-Control": "no-cache"])!
        task.didReceive(resp)
        task.didReceive(data)
        task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    static func mime(for ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js":   return "application/javascript; charset=utf-8"
        case "css":  return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "webmanifest": return "application/manifest+json; charset=utf-8"
        case "png":  return "image/png"
        case "svg":  return "image/svg+xml"
        case "woff2": return "font/woff2"
        default:     return "application/octet-stream"
        }
    }
}

final class Bridge: NSObject, WKScriptMessageHandler, WKUIDelegate {
    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        let fm = FileManager.default
        if message.name == "saveFile" {
            let name = (body["name"] as? String) ?? "export.json"
            let text = (body["text"] as? String) ?? ""
            let url = fm.temporaryDirectory.appendingPathComponent(name)
            try? text.data(using: .utf8)?.write(to: url, options: .atomic)
            share([url])
        } else if message.name == "openFile" {
            let name = (body["name"] as? String) ?? "file"
            guard let b64 = body["base64"] as? String, let data = Data(base64Encoded: b64) else { return }
            let url = fm.temporaryDirectory.appendingPathComponent(name)
            try? data.write(to: url, options: .atomic)
            share([url])
        }
    }

    private func share(_ items: [Any]) {
        DispatchQueue.main.async {
            guard let top = Bridge.topVC() else { return }
            let vc = UIActivityViewController(activityItems: items, applicationActivities: nil)
            if let pop = vc.popoverPresentationController {
                pop.sourceView = top.view
                pop.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.midY, width: 1, height: 1)
                pop.permittedArrowDirections = []
            }
            top.present(vc, animated: true)
        }
    }

    static func topVC() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let key = scenes.flatMap { $0.windows }.first(where: { $0.isKeyWindow }) ?? scenes.first?.windows.first
        var top = key?.rootViewController
        while let p = top?.presentedViewController { top = p }
        return top
    }
}

struct WebView: UIViewRepresentable {
    func makeCoordinator() -> Bridge { Bridge() }

    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        let ucc = WKUserContentController()
        ucc.add(context.coordinator, name: "saveFile")
        ucc.add(context.coordinator, name: "openFile")
        cfg.userContentController = ucc
        cfg.preferences.javaScriptCanOpenWindowsAutomatically = true
        cfg.allowsInlineMediaPlayback = true

        // bundled web root -> custom scheme
        let webRoot = Bundle.main.url(forResource: "web", withExtension: nil)
            ?? Bundle.main.bundleURL.appendingPathComponent("web")
        cfg.setURLSchemeHandler(AppSchemeHandler(root: webRoot), forURLScheme: "udci")

        let wv = WKWebView(frame: .zero, configuration: cfg)
        wv.uiDelegate = context.coordinator
        wv.isOpaque = false
        wv.backgroundColor = UIColor(red: 0.055, green: 0.078, blue: 0.098, alpha: 1)
        wv.scrollView.backgroundColor = wv.backgroundColor
        wv.scrollView.bounces = false
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        if #available(iOS 16.4, *) { wv.isInspectable = true }  // Safari Web Inspector during development

        wv.load(URLRequest(url: URL(string: "udci://app/index.html")!))
        return wv
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
