/* Keep the installed app covered until authentication and its first view settle. */
(() => {
  const portal = document.currentScript?.dataset.startupPage === 'interview';
  let returning = false;
  try { returning = portal && sessionStorage.getItem('interview-app-return') === '1'; } catch {}
  const enabled = Boolean(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone || document.referrer.startsWith('android-app://') || (portal && new URLSearchParams(location.search).get('app') === '1') || returning);
  if (!enabled) return;
  const root = document.documentElement;
  // iOS chooses the installed app's edge colors during launch. Restore the
  // lecture appearance before painting, rather than after the roster loads.
  if (document.currentScript?.dataset.startupPage === 'student' && navigator.standalone === true &&
      /iPhone|iPad|iPod/.test(navigator.userAgent || '') && !window.webkit?.messageHandlers?.interviewNative) {
    const viewport = document.querySelector('meta[name="viewport"]');
    const statusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    const theme = document.querySelector('meta[name="theme-color"]');
    const original = { viewport: viewport?.getAttribute('content'), statusBar: statusBar?.getAttribute('content'), theme: theme?.getAttribute('content') };
    window.__studentViewport = {
      update(category) {
        const lecture = category === 'lecture';
        root.classList.toggle('student-lecture-ios-standalone', lecture);
        if (viewport) viewport.setAttribute('content', lecture ? (original.viewport || 'width=device-width, initial-scale=1') + ', viewport-fit=cover' : original.viewport);
        if (statusBar) statusBar.setAttribute('content', lecture ? 'black-translucent' : original.statusBar);
        if (theme) theme.setAttribute('content', lecture ? '#0b2746' : original.theme);
      },
    };
    try {
      const saved = JSON.parse(localStorage.getItem('ronpark_outing_auth_v2') || 'null');
      const id = saved?.settings?.studentAuthId;
      const profile = saved?.settings?.studentProfiles?.[id];
      const student = saved?.students?.find(item => String(item.id) === String(id));
      const explicit = student?.studentCategory || student?.student_category;
      const category = ['offline', 'online_managed', 'lecture'].includes(explicit) ? explicit :
        student && (/^2/.test(String(id)) || /^9\d{5}$/.test(String(id))) ? 'lecture' : 'offline';
      window.__studentViewport.update(student && profile?.passwordHash && profile?.deviceToken ? category : 'offline');
    } catch { window.__studentViewport.update('offline'); }
  }
  root.classList.add('app-starting');
  let finished = false;
  const slow = window.setTimeout(() => {
    if (finished) return;
    const message = document.querySelector('[data-startup-message]');
    if (message) message.textContent = '연결이 지연되고 있어요. 잠시 기다리거나 다시 시도해주세요.';
    const retry = document.querySelector('[data-startup-retry]');
    if (retry) retry.hidden = false;
  }, 20000);
  document.addEventListener('click', event => {
    if (event.target.closest('[data-startup-retry]')) location.reload();
  });
  window.__appStartup = {
    finish() {
      if (finished) return;
      finished = true;
      window.clearTimeout(slow);
      // Paint the completed view beneath the same cover before fading it away.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        root.classList.add('app-startup-leaving');
        const overlay = document.getElementById('app-startup');
        overlay?.setAttribute('aria-hidden', 'true');
        if (overlay) overlay.inert = true;
        window.setTimeout(() => {
          root.classList.remove('app-starting', 'app-startup-leaving');
          overlay?.remove();
        }, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 240);
      }));
    }
  };
})();
