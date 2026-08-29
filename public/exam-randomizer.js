(() => {
  const shuffle = items => {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const apply = form => {
    if (!(form instanceof HTMLElement)) return;
    const questions = [...form.querySelectorAll(':scope > .question')];
    if (questions.length < 2) return;

    form.style.display = 'flex';
    form.style.flexDirection = 'column';

    const signature = questions.length + ':' + questions.map((q, i) => q.dataset.kayanQuestionKey || (q.dataset.kayanQuestionKey = String(i))).join(',');
    if (form.dataset.kayanShuffleSignature === signature && questions.every(q => q.dataset.kayanRandomOrder)) return;

    const order = shuffle(questions.map((_, i) => i));
    questions.forEach((q, i) => {
      q.dataset.kayanRandomOrder = String(order[i] + 10);
      q.style.order = String(order[i] + 10);
    });

    const meta = form.querySelector(':scope > .examMeta');
    if (meta) meta.style.order = '0';

    [...form.children].forEach(child => {
      if (child.classList?.contains('question') || child.classList?.contains('examMeta')) return;
      if (child.matches?.('button.primary')) child.style.order = '10000';
      else if (child.classList?.contains('errorBox')) child.style.order = '10001';
    });

    form.dataset.kayanShuffleSignature = signature;
  };

  const scan = () => document.querySelectorAll('.examForm').forEach(apply);
  const observer = new MutationObserver(scan);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      scan();
      observer.observe(document.body, { childList: true, subtree: true });
    }, { once: true });
  } else {
    scan();
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
