/* Public reviews: no visitor email or unapproved text is ever fetched. */
(function () {
  'use strict';
  var form = document.getElementById('review-form');
  var list = document.getElementById('published-reviews');
  var feedback = document.getElementById('review-feedback');
  if (!form || !list || !feedback) return;
  var inFlight = false;
  var loadingList = false;
  var requestId = null;
  var requestSignature = null;
  var submit = form.querySelector('[type="submit"]');
  function t(key, fallback) {
    var dictionary = window.ALESSANNA_PUBLIC_I18N;
    return dictionary && dictionary.site && dictionary.site[key] || fallback;
  }
  function rpc(name, args) {
    var config = window.SUPABASE_CONFIG || {};
    if (!config.url || !config.anonKey) return Promise.reject(new Error('not_configured'));
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 15000);
    return fetch(config.url + '/rest/v1/rpc/' + name, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', apikey: config.anonKey },
      body: JSON.stringify(args || {})
    }).then(async function (response) {
      var data = await response.json();
      if (!response.ok) throw new Error(data.message || 'review_failed');
      return data;
    }).finally(function () { clearTimeout(timeout); });
  }
  function renderReviews(rows) {
    if (!Array.isArray(rows)) throw new Error('review_failed');
    var fragment = document.createDocumentFragment();
    rows.forEach(function (row) {
      var card = document.createElement('figure');
      card.className = 'review-form-wrap published-review';
      var stars = document.createElement('div');
      stars.className = 'published-review-stars';
      stars.setAttribute('role', 'img');
      stars.setAttribute('aria-label', row.rating + '/5');
      stars.textContent = '★'.repeat(Math.max(1, Math.min(5, Number(row.rating) || 1)));
      var quote = document.createElement('blockquote');
      var body = document.createElement('p');
      body.textContent = String(row.body || '');
      quote.appendChild(body);
      var author = document.createElement('figcaption');
      author.textContent = String(row.author_name || '');
      card.append(stars, quote, author);
      fragment.appendChild(card);
    });
    list.replaceChildren(fragment);
  }
  function loadReviews() {
    if (loadingList || document.visibilityState === 'hidden') return;
    loadingList = true;
    rpc('review_public_list').then(renderReviews).catch(function () {
      // Keep the form usable. Do not substitute unmoderated or cached reviews.
    }).finally(function () { loadingList = false; });
  }
  function show(message, failed) {
    feedback.textContent = message;
    feedback.classList.toggle('is-error', Boolean(failed));
  }
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (inFlight) return;
    var name = form.elements.review_name.value.trim();
    var email = form.elements.review_email.value.trim();
    var rating = Number(form.elements.review_rating.value);
    var body = form.elements.review_message.value.trim();
    if (!name || body.length < 8 || !form.checkValidity()) {
      show(t('reviewInvalid', 'Проверьте имя, email и текст отзыва (минимум 8 символов).'), true);
      form.reportValidity();
      return;
    }
    var signature = JSON.stringify([name, email, rating, body]);
    if (!requestId || signature !== requestSignature) {
      requestId = crypto.randomUUID();
      requestSignature = signature;
    }
    inFlight = true;
    Array.from(form.elements).forEach(function (field) { field.disabled = true; });
    form.setAttribute('aria-busy', 'true');
    show(t('reviewSending', 'Отправляем отзыв…'));
    try {
      var result = await rpc('review_submit', { p_request_id: requestId, p_name: name,
        p_email: email || null, p_rating: rating, p_body: body,
        p_website: form.elements.review_website.value });
      if (!result || result.status !== 'received') throw new Error('review_failed');
      form.reset();
      requestId = null;
      requestSignature = null;
      show(t('reviewReceived', 'Спасибо! Отзыв отправлен и появится на сайте после одобрения.'));
    } catch (error) {
      show(error.message === 'review_rate_limited'
        ? t('reviewRateLimited', 'Слишком много отзывов. Попробуйте через час.')
        : t('reviewFailed', 'Не удалось отправить отзыв. Текст сохранён — попробуйте ещё раз.'), true);
    } finally {
      inFlight = false;
      Array.from(form.elements).forEach(function (field) { field.disabled = false; });
      form.removeAttribute('aria-busy');
    }
  });
  loadReviews();
  setInterval(loadReviews, 30000);
  document.addEventListener('visibilitychange', loadReviews);
})();
