(() => {
  'use strict';
  if (window !== top || location.origin !== 'https://outing-auth-app.vercel.app') return;
  window.__ronparkOpenAIPractice = true;
  window.__ronparkPracticeNative = true;
  window.__ronparkMockTestApp = true;
  Object.defineProperty(navigator, 'standalone', {value:true, configurable:true});
  // Match the existing installed-app bridge contract. Native origin/main-frame checks
  // apply again before any code exchange or authenticated practice request.
  window.webkit = {messageHandlers:{
    interviewNative:{postMessage:body => ronparkTestBridge.postMessage(JSON.stringify({kind:'live', body}))},
    interviewPractice:{postMessage:body => ronparkTestBridge.postMessage(JSON.stringify({kind:'practice', body}))}
  }};
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
})();
