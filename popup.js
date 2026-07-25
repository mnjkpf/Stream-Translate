const els = {
  apiKey: document.getElementById('apiKey'),
  sourceLang: document.getElementById('sourceLang'),
  targetLang: document.getElementById('targetLang'),
  model: document.getElementById('model'),
  save: document.getElementById('save'),
  status: document.getElementById('status')
};

// Завантажуємо збережені налаштування
chrome.storage.local.get(['apiKey', 'sourceLang', 'targetLang', 'model'], (data) => {
  if (data.apiKey) els.apiKey.value = data.apiKey;
  if (data.sourceLang) els.sourceLang.value = data.sourceLang;
  if (data.targetLang) els.targetLang.value = data.targetLang;
  if (data.model) els.model.value = data.model;
});

els.save.addEventListener('click', async () => {
  const apiKey = els.apiKey.value.trim();
  if (!apiKey) {
    els.status.textContent = 'Введіть API ключ';
    els.status.className = 'err';
    return;
  }

  await chrome.storage.local.set({
    apiKey,
    sourceLang: els.sourceLang.value,
    targetLang: els.targetLang.value,
    model: els.model.value.trim()
  });

  els.status.textContent = '✓ Збережено';
  els.status.className = 'ok';
  setTimeout(() => { els.status.textContent = ''; }, 2000);
});
