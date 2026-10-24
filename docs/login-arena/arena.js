(() => {
  'use strict';
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const motionButton = document.querySelector('.motion');
  const canvas = document.querySelector('#embers');
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
      radius: .5 + Math.random(), speed: 8 + Math.random() * 19, phase: Math.random() * 6.28
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
        ctx.fillStyle = `rgba(255,163,80,${.2 + (Math.sin(time / 1400 + p.phase) + 1) * .2})`;
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

  const form = document.querySelector('#login-form');
  const input = document.querySelector('#student-id');
  const status = document.querySelector('#form-status');
  input.addEventListener('input', () => { status.textContent = ''; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    status.textContent = '입장 준비가 완료되었습니다. 현재는 디자인 시안으로, 실제 계정 조회와 로그인은 진행되지 않습니다.';
  });
  const dialog = document.querySelector('#info-dialog');
  const content = {
    join: ['수강 신청 안내', '실제 적용 시 수강 신청 화면으로 이어지는 자리입니다. 이 시안에서는 화면 구성과 버튼의 반응만 확인할 수 있습니다.'],
    interview: ['다음 무대는, 면접.', '실제 적용 시 면접반 전용 로그인으로 이어집니다. 현재는 디자인 미리보기 화면입니다.'],
    help: ['고유번호 안내', '고유번호는 학원에서 안내받은 수강생 번호입니다. 번호를 모르신다면 학원 담당자에게 문의해주세요.']
  };
  document.querySelectorAll('[data-dialog]').forEach(button => button.addEventListener('click', () => {
    const [title, copy] = content[button.dataset.dialog];
    document.querySelector('#dialog-title').textContent = title;
    document.querySelector('#dialog-copy').textContent = copy;
    dialog.showModal();
  }));
  document.querySelector('#dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  } });
})();
