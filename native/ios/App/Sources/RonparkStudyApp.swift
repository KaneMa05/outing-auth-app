import SwiftUI
import WebKit
import InterviewNative

@main struct RonparkStudyApp: App {
    var body: some Scene { WindowGroup { StudentApp() } }
}

private struct InterviewLaunch: Identifiable { let id = UUID(); let code: String; let preview: Bool }

private struct StudentApp: View {
    @State private var launch: InterviewLaunch?
    #if DEBUG
    @State private var practice: PracticePortalSession?
    #endif
    var body: some View {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--interview-native-preview") {
            // UI tests run the real SwiftUI screens without opening a production web page.
            if ProcessInfo.processInfo.arguments.contains("--interview-legacy-fixture") { InterviewView(preview: true) }
            else if ProcessInfo.processInfo.arguments.contains("--portal-practice-filter-fixture") {
                InterviewPracticeView(mode: "job", loadSession: {
                    ["accountId": "ui-filter-fixture", "track": "공채", "mode": "job",
                     "fields": [["id": "criminal_law_investigation", "label": "형사법·수사절차"], ["id": "domestic_maritime_law", "label": "해사법규"]],
                     "questions": [
                        ["id": "nav", "prompt": "항법 질문", "category": "job", "tracks": ["공채"], "fieldIds": ["criminal_law_investigation"], "regions": ["서해"]],
                        ["id": "law", "prompt": "법규 질문", "category": "job", "tracks": ["공채"], "fieldIds": ["domestic_maritime_law"], "regions": ["중부"]]]]
                }, requestAnalysis: { _, _ in ["ok": true, "ready": true] })
            }
            else if ProcessInfo.processInfo.arguments.contains("--portal-personality-filter-fixture") {
                InterviewPracticeView(mode: "personality", loadSession: {
                    let rows: [[String: Any]] = (0..<50).map { index in
                        ["id": "personality-\(index)", "prompt": "인성 질문 \(index)", "category": "personality", "tracks": [String](), "fieldIds": [index < 25 ? "failure" : "teamwork"]]
                    }
                    return ["accountId": "personality-filter-ui", "track": "공채", "mode": "personality",
                        "fields": [["id": "failure", "label": "실패·성장"], ["id": "teamwork", "label": "협동심·팀워크"]], "questions": rows]
                }, requestAnalysis: { _, _ in ["ok": true, "ready": true] })
            }
            else if ProcessInfo.processInfo.arguments.contains("--portal-practice-ai-fixture") {
                InterviewPracticeView(mode: "ai", loadSession: {
                    ["accountId": "ui-fixture", "track": "공채", "questions": [["id": "portal-only", "prompt": "협업 경험을 설명해주세요.", "category": "personality", "tracks": ["공채"]]]]
                }, requestAnalysis: { _, _ in ["ok": true, "ready": true] })
            }
            else if ProcessInfo.processInfo.arguments.contains("--portal-practice-fixture") {
                InterviewPracticeView(loadSession: {
                    let recorded = ProcessInfo.processInfo.arguments.contains("--portal-recorded-question")
                    return ["accountId": "ui-fixture", "track": "공채", "questions": [[
                        "id": recorded ? "q-00c6efa46a2fb0112fa02e6c" : "portal-only",
                        "prompt": recorded ? "서해지방해양경찰청의 관할을 알고 있는가?" : "해양경찰의 역할을 설명해주세요.",
                        "tracks": ["공채"]]]]
                })
            }
            else { InterviewPracticeView() }
        } else { studentContent }
        #else
        studentContent
        #endif
    }
    private var studentContent: some View {
        ZStack(alignment: .bottomTrailing) {
            #if DEBUG
            StudentWebApp(onInterview: { code in launch = InterviewLaunch(code: code, preview: false) },
                onPractice: { view, mode in practice = PracticePortalSession(webView: view, mode: mode) })
            #else
            StudentWebApp { code in launch = InterviewLaunch(code: code, preview: false) }
            #endif

        }
        #if DEBUG
        .fullScreenCover(item: $practice) { session in
            InterviewPracticeView(mode: session.mode, loadSession: { try await session.load() },
                requestAnalysis: { action, fields in try await session.analysis(action, fields) })
        }
        #endif
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
    var onPractice: ((WKWebView, String) -> Void)? = nil
    static let host = InterviewLaunchPolicy.host
    func makeCoordinator() -> Coordinator { Coordinator(onInterview: onInterview, onPractice: onPractice) }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.userContentController.add(context.coordinator, name: "interviewNative")
        #if DEBUG
        config.userContentController.add(context.coordinator, name: "interviewPractice")
        let pcPractice = ProcessInfo.processInfo.arguments.contains("--interview-pc-practice")
        let practiceFlags = pcPractice ? "window.__ronparkPracticeNative=true;window.__ronparkWindowsPractice=true;" : "window.__ronparkOpenAIPractice=true;window.__ronparkPracticeNative=true;"
        let testFlag = ProcessInfo.processInfo.arguments.contains("--ordinary-app-verification") ? "" : "window.__ronparkMockTestApp=true;"
        config.userContentController.addUserScript(WKUserScript(source: "if(location.protocol === 'https:' && location.hostname === '\(Self.host)'){\(practiceFlags)\(testFlag)}", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        if !testFlag.isEmpty {
            let testRequests = """
                if (location.protocol === 'https:' && location.hostname === '\(Self.host)') {
                    const originalFetch = window.fetch.bind(window);
                    window.fetch = (input, init = {}) => {
                        const url = new URL(input instanceof Request ? input.url : input, location.href);
                        if (url.origin === location.origin && url.pathname.startsWith('/api/interview-')) {
                            const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
                            headers.set('X-Interview-Test-App', '1');
                            return originalFetch(input, {...init, headers});
                        }
                        return originalFetch(input, init);
                    };
                }
                """
            config.userContentController.addUserScript(WKUserScript(source: testRequests, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }

        #endif
        // The installed WKWebView is standalone too. Set this before the existing
        // web app evaluates its install gate; never apply it to third-party pages.
        let installedApp = WKUserScript(source: """
            if (location.protocol === 'https:' && location.hostname === '\(Self.host)') {
                Object.defineProperty(navigator, 'standalone', { value: true });
            }
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        config.userContentController.addUserScript(installedApp)
        let cameraLayout = WKUserScript(source: """
            if (location.protocol === 'https:' && location.hostname === '\(Self.host)' && (!location.port || location.port === '443')) {
              document.documentElement.dataset.ronparkInstalledIos = 'true';
              const style = document.createElement('style');
              style.textContent = `
                html[data-ronpark-installed-ios] .ip-live-view [data-live-screen="prep"] .il-camera {
                  width: min(100%, 216px);
                  height: auto;
                  aspect-ratio: 3 / 4;
                  margin-inline: auto;
                }
              `;
              document.head.appendChild(style);
            }
            """, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        config.userContentController.addUserScript(cameraLayout)
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--interview-api-status-diagnostic") {
            config.userContentController.addUserScript(WKUserScript(source: """
                if (location.protocol === 'https:' && location.hostname === '\(Self.host)') {
                  const post = async (path, body) => {
                    const response = await fetch(path, {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
                    return {status:response.status, body:await response.json()};
                  };
                  for (const name of ['job','personality','access']) {
                    (async () => {
                      let text;
                      try {
                        if (name === 'access') {
                          const result = await post('/api/interview-prep', {action:'mock_status'});
                          text = 'API 진단 access HTTP ' + result.status + ' allowed=' + result.body.allowed;
                        } else {
                          const bootstrap = await post('/api/interview-prep', {action:'practice_bootstrap',mode:name});
                          const result = await post('/api/interview-practice-openai', {action:'status',accountId:bootstrap.body.accountId});
                          text = 'API 진단 ' + name + ' HTTP ' + result.status + ' ready=' + result.body.ready + ' questions=' + (bootstrap.body.questions || []).length + ' bootstrap=' + bootstrap.status + ' reason=' + (result.body.reason || result.body.error || 'none');
                        }
                      } catch (error) { text = 'API 진단 ' + name + ' network=' + error.name; }
                      const result = document.createElement('p');result.textContent = text;document.body.prepend(result);
                    })();
                  }
                }
                """, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        if ProcessInfo.processInfo.arguments.contains("--web-camera-layout-fixture") {
            config.userContentController.addUserScript(WKUserScript(source: """
                if (location.protocol === 'https:' && location.hostname === '\(Self.host)') {
                  (async () => {
                    const {mountLive} = await import('https://\(Self.host)/client/interview-live-view.js?v=20261102-cli');
                    const host = document.createElement('main');
                    document.body.replaceChildren(host);
                    await mountLive(host, {request: async () => ({ready:false})});
                    const sheet = document.querySelector('link[data-interview-live-style]');
                    if (!sheet.sheet) await new Promise(resolve => sheet.addEventListener('load', resolve, {once:true}));
                    const live = host.querySelector('[data-live-screen="live"]');
                    live.hidden = false;
                    const self = host.querySelector('[data-live-self]');
                    self.hidden = false;
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    const preview = host.querySelector('.il-camera');
                    const p = preview.getBoundingClientRect(), l = self.getBoundingClientRect();
                    const result = document.createElement('p');
                    const equal = p.height > 0 && l.height > 0 && Math.abs(p.width/p.height - l.width/l.height) < 0.005;
                    result.textContent = equal ? '준비·면접 카메라 비율 일치' : '카메라 비율 불일치';
                    document.body.prepend(result);
                    live.hidden = true;
                  })().catch(error => {
                    const result = document.createElement('p');
                    result.textContent = '카메라 비율 검증 오류: ' + error.message;
                    document.body.prepend(result);
                  });
                }
                """, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        if ProcessInfo.processInfo.arguments.contains("--web-media-permission-fixture") {
            config.userContentController.addUserScript(WKUserScript(source: """
                if (location.protocol === 'https:' && location.hostname === '\(Self.host)') {
                  setTimeout(async () => {
                    const result = document.createElement('p');
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({audio:true,video:false});
                      stream.getTracks().forEach(track => track.stop());
                      result.textContent = '웹 마이크 권한 허용 확인';
                    } catch { result.textContent = '웹 마이크 권한 거부 확인'; }
                    document.body.prepend(result);
                  }, 500);
                }
                """, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
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
        #if DEBUG
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "interviewPractice")
        #endif
        uiView.stopLoading(); uiView.navigationDelegate = nil; uiView.uiDelegate = nil
    }
    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
        let onInterview: (String) -> Void
        let onPractice: ((WKWebView, String) -> Void)?
        init(onInterview: @escaping (String) -> Void, onPractice: ((WKWebView, String) -> Void)? = nil) { self.onInterview = onInterview; self.onPractice = onPractice }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            let origin = message.frameInfo.securityOrigin
            #if DEBUG
            if message.name == "interviewPractice", origin.protocol == "https", origin.host == StudentWebApp.host,
               origin.port == 0 || origin.port == 443, message.frameInfo.isMainFrame,
               let data = message.body as? [String: String], data.count == 1,
               let mode = data["mode"], ["job", "personality", "ai"].contains(mode), let webView = message.webView {
                onPractice?(webView, mode); return
            }
            #endif
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
        func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                     initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                     decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            let frameOrigin = frame.securityOrigin
            guard InterviewLaunchPolicy.acceptsMediaCapture(scheme: origin.protocol, host: origin.host, port: origin.port,
                    isMainFrame: frame.isMainFrame, topLevelURL: webView.url),
                  InterviewLaunchPolicy.acceptsMediaCapture(scheme: frameOrigin.protocol, host: frameOrigin.host, port: frameOrigin.port,
                    isMainFrame: frame.isMainFrame, topLevelURL: webView.url) else { decisionHandler(.deny); return }
            let resource: String, reason: String
            switch type {
            case .microphone:
                resource = "마이크"; reason = "모의면접 답변 녹음과 마이크 확인에 사용합니다."
            case .camera:
                resource = "카메라"; reason = "모의면접 카메라 미리보기에 사용합니다."
            case .cameraAndMicrophone:
                resource = "카메라와 마이크"; reason = "모의면접 카메라 미리보기와 답변 녹음에 사용합니다."
            @unknown default: decisionHandler(.deny); return
            }
            let name = Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "론박스터디 앱"
            let alert = UIAlertController(title: "‘\(name)’에서 \(resource)를 사용하도록 허용할까요?", message: reason, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "허용 안 함", style: .cancel) { _ in decisionHandler(.deny) })
            alert.addAction(UIAlertAction(title: "허용", style: .default) { [weak webView] _ in
                // A navigation while the dialog was open must not authorize another site.
                let valid = InterviewLaunchPolicy.acceptsMediaCapture(scheme: origin.protocol, host: origin.host, port: origin.port,
                    isMainFrame: frame.isMainFrame, topLevelURL: webView?.url)
                decisionHandler(valid ? .grant : .deny)
            })
            present(alert, from: webView, fallback: { decisionHandler(.deny) })
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

#if DEBUG
/// Reads the authenticated portal through its own cookie jar; credentials never enter JavaScript payloads.
@MainActor private final class PracticePortalSession: NSObject, Identifiable, URLSessionTaskDelegate {
    let id = UUID()
    let mode: String
    private weak var webView: WKWebView?
    init(webView: WKWebView, mode: String) { self.webView = webView; self.mode = mode; super.init() }
    func load() async throws -> [String: Any] {
        let body = try await post("/api/interview-prep", ["action": "practice_bootstrap", "mode": mode])
        guard body["ok"] as? Bool == true else { throw URLError(.userAuthenticationRequired) }
        return body
    }
    func analysis(_ action: String, _ fields: [String: Any]) async throws -> [String: Any] {
        guard ["status", "submit", "get"].contains(action), fields["action"] == nil else { throw URLError(.badURL) }
        var body = fields; body["action"] = action
        let path = ProcessInfo.processInfo.arguments.contains("--interview-pc-practice") ? "/api/interview-practice-cli" : "/api/interview-practice-openai"
        return try await post(path, body)
    }
    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    private func post(_ path: String, _ fields: [String: Any]) async throws -> [String: Any] {
        guard let webView, let page = webView.url, page.scheme == "https", page.host == InterviewLaunchPolicy.host,
              page.port == nil || page.port == 443 else { throw URLError(.userAuthenticationRequired) }
        let cookies = await withCheckedContinuation { continuation in
            webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { continuation.resume(returning: $0) }
        }
        let relevant = cookies.filter { $0.domain == InterviewLaunchPolicy.host || $0.domain == "." + InterviewLaunchPolicy.host }
        let origin = "https://" + InterviewLaunchPolicy.host
        var request = URLRequest(url: URL(string: origin + path)!)
        request.httpMethod = "POST"; request.timeoutInterval = 20
        request.setValue(origin, forHTTPHeaderField: "Origin")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !ProcessInfo.processInfo.arguments.contains("--ordinary-app-verification") {
            request.setValue("1", forHTTPHeaderField: "X-Interview-Test-App")
        }
        request.setValue(HTTPCookie.requestHeaderFields(with: relevant)["Cookie"], forHTTPHeaderField: "Cookie")
        request.httpBody = try JSONSerialization.data(withJSONObject: fields)
        let config = URLSessionConfiguration.ephemeral; config.httpCookieStorage = nil
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil); defer { session.invalidateAndCancel() }
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse, (200...599).contains(response.statusCode),
              let body = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw URLError(.badServerResponse) }
        return body
    }
}
#endif
