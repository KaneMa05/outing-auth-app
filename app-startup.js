/* Keep the installed app covered until authentication and its first view settle. */
(() => {
  const portal = document.currentScript?.dataset.startupPage === 'interview';
  let returning = false;
  try { returning = portal && sessionStorage.getItem('interview-app-return') === '1'; } catch {}
  const enabled = Boolean(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone || document.referrer.startsWith('android-app://') || (portal && new URLSearchParams(location.search).get('app') === '1') || returning);
  if (!enabled) return;
  const root = document.documentElement;
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
