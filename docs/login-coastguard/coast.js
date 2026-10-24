(() => {
  'use strict';
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const motionButton = document.querySelector('.motion');
  const canvas = document.querySelector('#sea-mist');
  const ctx = canvas.getContext('2d');
  let paused = motionQuery.matches;
  let frame = 0;
  let previous = 0;
  let width = 0;
  let height = 0;
  let particles = [];
  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width; height = rect.height;
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    particles = Array.from({ length: width < 760 ? 17 : 34 }, () => ({
      x: Math.random() * width * .72, y: Math.random() * height,
      radius: .5 + Math.random(), speed: 4 + Math.random() * 10, phase: Math.random() * 6.28
    }));
  }
  function draw(time) {
    frame = 0;
    if (paused || document.hidden || !ctx) return;
    if (time - previous >= 32) {
      const dt = Math.min((time - previous) / 1000, .06); previous = time;
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        p.y -= p.speed * dt; p.x += Math.sin(time / 2600 + p.phase) * dt * 5;
        if (p.y < 0) p.y = height;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(177,222,242,${.2 + (Math.sin(time / 1400 + p.phase) + 1) * .2})`;
        ctx.fill();
      }
    }
    frame = requestAnimationFrame(draw);
  }
  function syncMotion() {
    cancelAnimationFrame(frame); frame = 0;
    document.body.classList.toggle('paused', paused || document.hidden);
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.querySelector('.motion-label').textContent = paused ? '모션 켜기' : '모션 끄기';
    motionButton.firstElementChild.textContent = paused ? '▷' : 'Ⅱ';
    if (!paused && !document.hidden && ctx) { previous = performance.now(); frame = requestAnimationFrame(draw); }
  }
  motionButton.addEventListener('click', () => { paused = !paused; syncMotion(); });
  motionQuery.addEventListener('change', event => { paused = event.matches; syncMotion(); });
  document.addEventListener('visibilitychange', syncMotion);
  addEventListener('resize', resize);
  resize(); syncMotion();

  const dialog = document.querySelector('#info-dialog');
  document.querySelector('#kakao-login').addEventListener('click', () => {
    document.querySelector('#dialog-title').textContent = '카카오 로그인하기';
    document.querySelector('#dialog-copy').textContent = '현재는 디자인 시안입니다. 실제 카카오 로그인은 연결되지 않습니다.';
    dialog.showModal();
  });
  document.querySelector('#dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  } });
})();
