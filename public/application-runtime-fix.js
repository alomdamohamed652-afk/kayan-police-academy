(() => {
  // Defensive runtime normalization for the citizen application page.
  // The API can contain legacy/malformed question records. Never allow one bad
  // question to crash the whole React application when an application batch is open.
  const originalFetch = window.fetch.bind(window);

  const normalizeQuestion = (q, index) => {
    if (!q || typeof q !== 'object') return null;
    const type = ['choice', 'yesno', 'text'].includes(q.type) ? q.type : 'text';
    const text = typeof q.text === 'string' ? q.text.trim() : String(q.text ?? '').trim();
    if (!text) return null;
    const options = Array.isArray(q.options)
      ? q.options.map(v => String(v ?? '').trim()).filter(Boolean)
      : [];
    return {
      ...q,
      id: String(q.id || `runtime-question-${index + 1}`),
      text,
      type,
      options,
      required: q.required !== false,
    };
  };

  const normalizeAcademy = payload => {
    const out = payload && typeof payload === 'object' ? { ...payload } : {};
    const application = out.application && typeof out.application === 'object'
      ? { ...out.application }
      : {};

    application.title = String(application.title || 'التقديم الأولي للشرطة');
    application.description = String(application.description || 'نموذج التقديم الرسمي للانضمام إلى شرطة كيان.');
    application.questions = (Array.isArray(application.questions) ? application.questions : [])
      .map(normalizeQuestion)
      .filter(Boolean);

    out.application = application;

    if (out.batch && typeof out.batch !== 'object') out.batch = null;
    if (out.batch) {
      out.batch = {
        ...out.batch,
        id: String(out.batch.id || ''),
        name: String(out.batch.name || 'دفعة التقديم'),
      };
      if (!out.batch.id) out.batch = null;
    }

    return out;
  };

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const input = args[0];
      const url = typeof input === 'string' ? input : input?.url || '';
      const path = new URL(url, window.location.origin).pathname;
      if (path !== '/api/public/academy') return response;

      const payload = await response.clone().json();
      if (!response.ok) return response;

      const normalized = normalizeAcademy(payload);
      const headers = new Headers(response.headers);
      headers.set('Content-Type', 'application/json');
      return new Response(JSON.stringify(normalized), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      // Never interfere with the original request if normalization itself fails.
      return response;
    }
  };
})();
