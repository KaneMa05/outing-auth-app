import SwiftUI
import WebKit
import InterviewNative

/// UIKit owns the horizontal push/pop. The student WKWebView remains underneath.
struct NativePracticeNavigation: UIViewControllerRepresentable {
    let onInterview: (String) -> Void
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIViewController(context: Context) -> UINavigationController {
        let navigation = UINavigationController(); navigation.setNavigationBarHidden(true, animated: false)
        navigation.delegate = context.coordinator; navigation.interactivePopGestureRecognizer?.isEnabled = false
        context.coordinator.navigation = navigation
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--native-practice-navigation-fixture") {
            let root = UIHostingController(rootView: NativePracticeNavigationFixture(open: context.coordinator.openFixture))
            navigation.setViewControllers([root], animated: false); return navigation
        }
        #endif
        let root = UIHostingController(rootView: StudentWebApp(onInterview: onInterview,
            onPractice: { web, mode, id in context.coordinator.open(web: web, mode: mode, id: id) }))
        navigation.setViewControllers([root], animated: false); return navigation
    }
    func updateUIViewController(_ controller: UINavigationController, context: Context) {}
    static func dismantleUIViewController(_ controller: UINavigationController, coordinator: Coordinator) { coordinator.session?.close() }
    @MainActor final class Coordinator: NSObject, UINavigationControllerDelegate {
        weak var navigation: UINavigationController?
        var session: PracticePortalSession?
        func navigationController(_ navigationController: UINavigationController, willShow viewController: UIViewController, animated: Bool) {
            navigationController.setNavigationBarHidden(true, animated: false)
        }
        func open(web: WKWebView, mode: String, id: String) {
            guard session == nil, navigation?.viewControllers.count == 1 else { return }
            let session = PracticePortalSession(webView: web, mode: mode, sessionID: id); self.session = session
            let view = InterviewPracticeView(mode: mode, loadSession: { try await session.load() },
                syncRecords: { body, files in try await session.syncRecords(body, files: files) },
                loadCaptions: { try await session.captions($0) },
                saveCaptions: { try await session.saveCaption($0, number: $1, revision: $2, text: $3) }, onClose: { [weak self] in self?.close() }, onWebRecords: { [weak self] in self?.showWebRecords() })
            navigation?.pushViewController(UIHostingController(rootView: view), animated: true)
        }
        func close() { session?.close(); session = nil; navigation?.popToRootViewController(animated: true) }
        func showWebRecords() { session?.showWebRecords(); close() }
        #if DEBUG
        func openFixture(_ mode: String) {
            let view = InterviewPracticeView(mode: mode, loadSession: {
                ["ok": true, "accountId": "native-ui-fixture", "mode": mode, "track": "공채",
                 "fields": [["id": mode == "job" ? "coast_guard" : "teamwork", "label": mode == "job" ? "공통 직무" : "협동심·팀워크"]],
                 "questions": [["id": "native-ui-\(mode)", "prompt": "가상 면접 질문입니다.", "category": mode,
                                "tracks": ["공채"], "fieldIds": [mode == "job" ? "coast_guard" : "teamwork"], "regions": ["서해"]]]]
            }, onClose: { [weak self] in self?.close() })
            navigation?.pushViewController(UIHostingController(rootView: view), animated: true)
        }
        #endif
    }
}

#if DEBUG
private struct NativePracticeNavigationFixture: View {
    let open: (String) -> Void
    var body: some View { VStack(spacing: 24) {
        Button("직무(전공) 연습모드") { open("job") }.accessibilityIdentifier("native.menu.job")
        Button("인성 연습모드") { open("personality") }.accessibilityIdentifier("native.menu.personality")
    } }
}
#endif
