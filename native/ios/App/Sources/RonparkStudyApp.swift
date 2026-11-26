import SwiftUI
import WebKit
import InterviewNative

@main struct RonparkStudyApp: App {
    var body: some Scene { WindowGroup { StudentApp() } }
}

private struct InterviewLaunch: Identifiable { let id = UUID(); let code: String; let preview: Bool }

struct WebPageAppearance {
    let color: UIColor
    let scheme: ColorScheme
    init?(theme: UIColor?) {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        guard theme?.getRed(&red, green: &green, blue: &blue, alpha: &alpha) == true, alpha > 0.99 else { return nil }
        // Existing navy student pages, interview login, and the interview app surface.
        let palettes: [(UInt32, ColorScheme)] = [(0x0b2746, .dark), (0x050f1c, .dark), (0xf2f5f7, .light)]
        for (hex, scheme) in palettes {
            let r = CGFloat((hex >> 16) & 255) / 255, g = CGFloat((hex >> 8) & 255) / 255, b = CGFloat(hex & 255) / 255
            if abs(red - r) < 0.001 && abs(green - g) < 0.001 && abs(blue - b) < 0.001 {
                self.color = UIColor(red: r, green: g, blue: b, alpha: 1); self.scheme = scheme
                return
            }
        }
        return nil
    }
}

private struct StudentApp: View {
    @State private var launch: InterviewLaunch?
    @State private var pageAppearance: WebPageAppearance?
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
            NativePracticeNavigation(onInterview: { code in launch = InterviewLaunch(code: code, preview: false) },
                                     onAppearance: { pageAppearance = $0 })
            #if DEBUG
            if !ProcessInfo.processInfo.arguments.contains("--store-screenshots") {
            if ProcessInfo.processInfo.arguments.contains("--enable-internal-demo") {
            Button("무료 모의면접 시연") { launch = InterviewLaunch(code: "", preview: true) }
                .buttonStyle(.borderedProminent).padding(.bottom, 75).padding(.trailing, 12)
            }
            }
            #endif
        }
        // Color only the native safe areas; keep the web view's existing bounds.
        .background {
            if let pageAppearance { Color(uiColor: pageAppearance.color).ignoresSafeArea() }
        }
        // A dark presentation gives the status bar and home indicator light ink.
        // Restore the system appearance while the separate interview is presented.
        .preferredColorScheme(launch == nil ? pageAppearance?.scheme : nil)
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
struct StudentWebApp: UIViewRepresentable {
    let onAppearance: (WebPageAppearance?) -> Void
    let onInterview: (String) -> Void
    let onPractice: (WKWebView, String, String) -> Void
    static let host = InterviewLaunchPolicy.host
    func makeCoordinator() -> Coordinator { Coordinator(onAppearance: onAppearance, onInterview: onInterview, onPractice: onPractice) }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.userContentController.add(context.coordinator, name: "interviewNative")
        config.userContentController.add(context.coordinator, name: "interviewPractice")
        // The installed WKWebView is standalone too. Set this before the existing
        // web app evaluates its install gate; never apply it to third-party pages.
        let installedApp = WKUserScript(source: """
            if (location.protocol === 'https:' && ['\(Self.host)', 'app.ronparkpass.com'].includes(location.hostname)) {
                Object.defineProperty(navigator, 'standalone', { value: true });
                window.__ronparkBetaPracticeNative = true;
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
        context.coordinator.observeAppearance(of: view)
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--interview-login-preview") {
            // Read-only UI check of the public login screen; no account or auth bypass.
            view.load(URLRequest(url: URL(string: "https://" + Self.host + "/interview?app=1")!))
            return view
        }
        #endif
        view.load(URLRequest(url: URL(string: "https://" + Self.host + "/index.html#home")!))
        return view
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        coordinator.stopObservingAppearance()
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "interviewNative")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "interviewPractice")
        uiView.stopLoading(); uiView.navigationDelegate = nil; uiView.uiDelegate = nil
    }
    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
        let onAppearance: (WebPageAppearance?) -> Void
        private var themeObservation: NSKeyValueObservation?
        private var urlObservation: NSKeyValueObservation?
        let onInterview: (String) -> Void
        let onPractice: (WKWebView, String, String) -> Void
        init(onAppearance: @escaping (WebPageAppearance?) -> Void, onInterview: @escaping (String) -> Void, onPractice: @escaping (WKWebView, String, String) -> Void) { self.onAppearance = onAppearance; self.onInterview = onInterview; self.onPractice = onPractice }
        func observeAppearance(of webView: WKWebView) {
            themeObservation = webView.observe(\.themeColor, options: [.initial, .new]) { [weak self] view, _ in
                self?.updateAppearance(of: view)
            }
            urlObservation = webView.observe(\.url, options: [.new]) { [weak self] view, _ in
                self?.updateAppearance(of: view)
            }
        }
        func stopObservingAppearance() {
            themeObservation?.invalidate(); themeObservation = nil
            urlObservation?.invalidate(); urlObservation = nil
        }
        private func updateAppearance(of webView: WKWebView) {
            // Defer SwiftUI state changes out of makeUIView and discard pending work on teardown.
            DispatchQueue.main.async { [weak self, weak webView] in
                guard let self, let webView, self.themeObservation != nil else { return }
                let url = webView.url
                let ownPage = url?.scheme == "https" && [StudentWebApp.host, "app.ronparkpass.com"].contains(url?.host ?? "") &&
                    (url?.port == nil || url?.port == 443)
                let appearance = ownPage ? WebPageAppearance(theme: webView.themeColor) : nil
                // Keep web controls in their existing appearance when only the system bars turn dark.
                let style: UIUserInterfaceStyle = appearance == nil ? .unspecified : .light
                if webView.overrideUserInterfaceStyle != style { webView.overrideUserInterfaceStyle = style }
                self.onAppearance(appearance)
            }
        }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            let origin = message.frameInfo.securityOrigin
            if message.name == "interviewPractice", let data = message.body as? [String: String],
               let view = message.webView,
               InterviewLaunchPolicy.acceptsPractice(scheme: origin.protocol, host: origin.host, port: origin.port,
                   isMainFrame: message.frameInfo.isMainFrame, topLevelURL: view.url, payload: data),
               let mode = data["mode"], let id = data["sessionId"] {
                onPractice(view, mode, id); return
            }
            guard message.name == "interviewNative", let data = message.body as? [String: String],
                  InterviewLaunchPolicy.accepts(scheme: origin.protocol, host: origin.host, port: origin.port,
                                                isMainFrame: message.frameInfo.isMainFrame, payload: data),
                  let code = data["code"] else { return }
            onInterview(code)
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
            if InterviewLaunchPolicy.allowsWebNavigation(url) { decisionHandler(.allow); return }
            // Never run the native bridge for third-party pages or unknown URL schemes.
            decisionHandler(.cancel)
            if navigationAction.navigationType == .linkActivated, ["https", "http", "tel", "mailto"].contains(url.scheme ?? "") {
                UIApplication.shared.open(url)
            }
        }
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            guard navigationAction.targetFrame == nil, let url = navigationAction.request.url else { return nil }
            if InterviewLaunchPolicy.allowsWebNavigation(url) { webView.load(navigationAction.request) }
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
