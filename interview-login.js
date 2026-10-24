// Presentation only. Authentication continues through interview-portal.js.
export function mountInterviewLogin(host, {enabled = false, kakaoEnabled = false, retry = false} = {}) {
  const ready = enabled && kakaoEnabled && !retry;
  const message = retry ? '로그인 상태를 확인하지 못했습니다.' : !enabled ? '면접반 웹 로그인을 준비 중입니다.' : !kakaoEnabled ? '카카오 로그인 연결을 준비 중입니다.' : '';
  host.innerHTML = `<div class="ip-coast-screen">
    <a class="ip-coast-skip" href="#ip-coast-login">로그인으로 바로 가기</a>
    <div class="ip-coast-scene" aria-hidden="true"><div class="ip-coast-image"></div><div class="ip-coast-shade"></div></div>
    <header class="ip-coast-header">
      <a class="ip-coast-brand" href="/interview" aria-label="론박스터디 면접반"><span class="ip-coast-mark" aria-hidden="true">R<i></i></span><span>론박스터디<small>RONPARK STUDY</small></span></a>
    </header>
    <div class="ip-coast-main">
      <section class="ip-coast-hero" aria-labelledby="ip-coast-title">
        <p class="ip-coast-chapter"><span></span>해양경찰을 향한 마지막 항해</p>
        <div class="ip-coast-copy"><p class="ip-coast-overline">해양경찰 면접, 론박스터디.</p>
          <h1 id="ip-coast-title">바다를 지킬<br>당신의 답변.</h1>
          <p class="ip-coast-description">파도 앞에서 흔들리지 않는 마음.<br>당신의 경험이 사명감 있는 답변이 되도록.</p>
          <div class="ip-coast-values"><span>책임감</span><i></i><span>판단력</span><i></i><span>사명감</span></div>
        </div>
      </section>
      <section class="ip-coast-entry" aria-label="면접반 카카오 로그인">
        <button id="ip-coast-login" class="ip-coast-kakao" type="button" data-kakao="login" ${ready ? '' : 'disabled'} ${message ? 'aria-describedby="ip-coast-message"' : ''}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.5 3 2 6.5 2 10.8c0 2.8 1.8 5.2 4.5 6.6L5.4 21l4.3-2.6c.7.1 1.5.2 2.3.2 5.5 0 10-3.5 10-7.8S17.5 3 12 3Z"/></svg>
          <span>카카오 로그인하기</span><span class="ip-coast-arrow" aria-hidden="true">↗</span>
        </button>
        <p id="ip-coast-message" class="ip-auth-message" data-auth-message role="status" ${retry ? 'data-error="true"' : ''}>${message}</p>
        ${retry ? '<button class="ip-coast-retry" type="button" data-refresh>다시 시도</button>' : ''}
      </section>
    </div>
    <footer class="ip-coast-footer"><span>© RONPARK STUDY</span><span>BE READY. BE RESPONSIBLE.</span><span>해양경찰 면접 준비 · 론박스터디</span></footer>
  </div>`;
  const screen = host.querySelector('.ip-coast-screen');
  function sync() {
    screen.classList.toggle('ip-coast-paused', document.hidden);
  }
  document.addEventListener('visibilitychange', sync);
  sync();
  return () => {
    document.removeEventListener('visibilitychange', sync);
  };
}
