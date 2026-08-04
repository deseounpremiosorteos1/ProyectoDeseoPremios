(() => {
  'use strict';

  const STORAGE_KEY = 'dup-theme';

  function getSavedTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'dark' || saved === 'light' ? saved : 'light';
  }

  function applyTheme(theme) {
    const isDark = theme === 'dark';

    document.body.classList.toggle('dark-mode', isDark);
    document.documentElement.classList.toggle('dark-mode', isDark);
    document.documentElement.dataset.theme = theme;

    const desktopIcon = document.getElementById('theme-icon');
    const mobileIcon = document.getElementById('mobile-theme-icon');
    const desktopButton = document.getElementById('theme-toggle');

    if (desktopIcon) desktopIcon.textContent = isDark ? '☀️' : '🌙';
    if (mobileIcon) mobileIcon.textContent = isDark ? '☀️' : '🌙';

    if (desktopButton) {
      desktopButton.setAttribute('aria-pressed', String(isDark));
      desktopButton.setAttribute(
        'aria-label',
        isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'
      );
      desktopButton.title = isDark
        ? 'Cambiar a tema claro'
        : 'Cambiar a tema oscuro';
    }
  }

  function toggleTheme() {
    const nextTheme = document.body.classList.contains('dark-mode')
      ? 'light'
      : 'dark';

    localStorage.setItem(STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  }

  function initializeTheme() {
    applyTheme(getSavedTheme());

    const desktopButton = document.getElementById('theme-toggle');
    const mobileButton = document.getElementById('mobile-theme-toggle');

    if (desktopButton) {
      desktopButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleTheme();
      };
    }

    if (mobileButton) {
      mobileButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleTheme();
      };
    }
  }

  window.toggleTheme = toggleTheme;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTheme, { once: true });
  } else {
    initializeTheme();
  }
})();
