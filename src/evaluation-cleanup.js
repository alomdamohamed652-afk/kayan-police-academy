// Prevent the legacy evaluation enhancement from leaking into other SPA routes.
// The evaluation UI can stay unfinished for now, but it must never pollute the rest of the portal.
const cleanupEvaluationPanels = () => {
  const panels = [...document.querySelectorAll('#kayan-evaluation-clean, .kayanFixPanel')];
  if (location.pathname !== '/academy/evaluations') {
    panels.forEach(panel => panel.remove());
    return;
  }

  // On the evaluation route itself, keep at most one injected panel.
  panels.slice(1).forEach(panel => panel.remove());
};

cleanupEvaluationPanels();
const observer = new MutationObserver(() => cleanupEvaluationPanels());
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('popstate', () => setTimeout(cleanupEvaluationPanels, 0));
setInterval(cleanupEvaluationPanels, 500);
