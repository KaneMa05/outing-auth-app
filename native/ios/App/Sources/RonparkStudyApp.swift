import SwiftUI
import WebKit
import InterviewNative

@main struct RonparkStudyApp: App {
    var body: some Scene { WindowGroup { StudentApp() } }
}

private struct InterviewLaunch: Identifiable { let id = UUID(); let code: String; let preview: Bool }

private struct StudentApp: View {
    @State private var launch: InterviewLaunch?
    var body: some View {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--interview-native-preview") {
            // UI tests run the real SwiftUI screens without opening a production web page.
            InterviewView(preview: true)
        } else { studentContent }
        #else
        studentContent
        #endif
    }
    private var studentContent: some View {
        ZStack(alignment: .bottomTrailing) {
            StudentWebApp { code in launch = InterviewLaunch(code: code, preview: false) }
            #if DEBUG
            Button("무료 모의면접 시연") { launch = InterviewLaunch(code: "", preview: true) }
                .buttonStyle(.borderedProminent).padding(.bottom, 75).padding(.trailing, 12)
            #endif
        }
        .fullScreenCover(item: $launch) { entry in
            #if DEBUG
            if entry.preview { InterviewView(preview: true) }
            else { InterviewView(launchCode: entry.code) }
            #else
            InterviewView(launchCode: entry.code)
            #endif
        }
    }
}

// Existing student pages remain in a persistent WKWebView. Only the interview route presents SwiftUI.
// Safari/PWA cookies are not shared: first login in this installed app is required.
private struct StudentWebApp: UIViewRepresentable {
    let onInterview: (String) -> Void
    static let host = InterviewLaunchPolicy.host
    func makeCoordinator() -> Coordinator { Coordinator(onInterview: onInterview) }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.userContentController.add(context.coordinator, name: "interviewNative")
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator; view.uiDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = true
        view.load(URLRequest(url: URL(string: "https://" + Self.host + "/index.html#home")!))
        return view
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "interviewNative")
        uiView.stopLoading(); uiView.navigationDelegate = nil; uiView.uiDelegate = nil
    }
    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
        let onInterview: (String) -> Void
        init(onInterview: @escaping (String) -> Void) { self.onInterview = onInterview }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            let origin = message.frameInfo.securityOrigin
            guard message.name == "interviewNative", let data = message.body as? [String: String],
                  InterviewLaunchPolicy.accepts(scheme: origin.protocol, host: origin.host, port: origin.port,
                                                isMainFrame: message.frameInfo.isMainFrame, payload: data),
                  let code = data["code"] else { return }
            onInterview(code)
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
            if url.scheme == "https", url.host == StudentWebApp.host { decisionHandler(.allow); return }
            // Never run the native bridge for third-party pages or unknown URL schemes.
            decisionHandler(.cancel)
            if navigationAction.navigationType == .linkActivated, ["https", "http", "tel", "mailto"].contains(url.scheme ?? "") {
                UIApplication.shared.open(url)
            }
        }
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            guard navigationAction.targetFrame == nil, let url = navigationAction.request.url else { return nil }
            if url.scheme == "https", url.host == StudentWebApp.host { webView.load(navigationAction.request) }
            else if ["https", "http", "tel", "mailto"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
            return nil
        }
        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler() })
            present(alert, from: webView, fallback: completionHandler)
        }
        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler(true) })
            present(alert, from: webView) { completionHandler(false) }
        }
        private func present(_ alert: UIAlertController, from webView: WKWebView, fallback: () -> Void) {
            guard var controller = webView.window?.rootViewController else { fallback(); return }
            while let presented = controller.presentedViewController { controller = presented }
            if controller.isBeingDismissed || controller is UIAlertController { fallback(); return }
            controller.present(alert, animated: true)
        }
    }
}
