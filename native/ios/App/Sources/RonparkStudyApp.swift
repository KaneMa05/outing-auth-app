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
            if ProcessInfo.processInfo.arguments.contains("--interview-legacy-fixture") { InterviewView(preview: true) }
            else { InterviewPracticeView() }
        } else { studentContent }
        #else
        studentContent
        #endif
    }
    private var studentContent: some View {
        ZStack(alignment: .bottomTrailing) {
            StudentWebApp { code in launch = InterviewLaunch(code: code, preview: false) }

        }
        .fullScreenCover(item: $launch) { entry in
            #if DEBUG
            if entry.preview { InterviewPracticeView() }
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
        // The installed WKWebView is standalone too. Set this before the existing
        // web app evaluates its install gate; never apply it to third-party pages.
        let installedApp = WKUserScript(source: """
            if (location.protocol === 'https:' && location.hostname === '\(Self.host)') {
                Object.defineProperty(navigator, 'standalone', { value: true });
            }
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        config.userContentController.addUserScript(installedApp)
        #if DEBUG
        // Screenshot-only login uses ephemeral runner environment values. Never
        // compile credentials into the app or include them in test activity logs.
        let env = ProcessInfo.processInfo.environment
        if ProcessInfo.processInfo.arguments.contains("--store-screenshots"),
           let account = env["REVIEW_STUDENT_ID"], let password = env["REVIEW_STUDENT_PASSWORD"],
           let token = env["REVIEW_SCREENSHOT_DEVICE_TOKEN"],
           let data = try? JSONSerialization.data(withJSONObject: [account, password, token]),
           let credentials = String(data: data, encoding: .utf8) {
            let source = """
                if (location.protocol === 'https:' && location.hostname === '\(Self.host)') {
                  const credentials = \(credentials);
                  localStorage.setItem('outing-pending-device:' + credentials[0], credentials[2]);
                  let lastLookup = 0, submitted = false;
                  const timer = setInterval(() => {
                    const form = document.querySelector('form.student-auth-card');
                    if (!form) return;
                    const id = form.querySelector('input[name="studentId"]');
                    const profile = form.querySelector('.student-auth-profile');
                    if (id && (!profile || profile.hidden) && Date.now() - lastLookup > 2000) {
                      id.value = credentials[0];
                      const button = Array.from(form.querySelectorAll('button')).find(b => b.textContent === '로그인');
                      if (button) { lastLookup = Date.now(); button.click(); }
                    }
                    if (!submitted && profile && !profile.hidden) {
                      const password = form.querySelector('input[name="password"]');
                      if (password) { submitted = true; password.value = credentials[1]; form.requestSubmit(); clearInterval(timer); }
                    }
                  }, 500);
                  setTimeout(() => clearInterval(timer), 45000);
                }
                """
            config.userContentController.addUserScript(WKUserScript(source: source,
                injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        #endif
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator; view.uiDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = true
        #if DEBUG
        let startPath = ProcessInfo.processInfo.arguments.contains("--store-screenshots")
            ? "/index.html#home" : "/interview?app=1"
        #else
        let startPath = "/index.html#home"
        #endif
        view.load(URLRequest(url: URL(string: "https://" + Self.host + startPath)!))
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
