// Apply the theme before first paint to avoid a flash. Runs before the app bundle.
(function () {
  try {
    var t = (JSON.parse(localStorage.getItem('uniplan:ui:v1')) || {}).theme || 'system';
    if (t === 'system') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
  } catch (e) {}
})();
