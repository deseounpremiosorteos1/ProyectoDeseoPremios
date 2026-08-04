/* ============================================================
   DESEO UN PREMIO — COMPORTAMIENTO GLOBAL
   Cargar al final de <body>, después de los JS de cada página.
   ============================================================ */
(() => {
  'use strict';

  const STORAGE_KEY = 'deseoUnPremioTheme';

  function applyTheme(isDark) {
    document.body.classList.toggle('dark-mode', isDark);

    document.querySelectorAll('#theme-icon, [data-theme-icon]').forEach(icon => {
      icon.textContent = isDark ? '☀️' : '🌙';
    });

    document.querySelectorAll('.theme-toggle').forEach(button => {
      button.setAttribute(
        'aria-label',
        isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'
      );
    });
  }

  function toggleTheme() {
    const nextDark = !document.body.classList.contains('dark-mode');
    applyTheme(nextDark);
    localStorage.setItem(STORAGE_KEY, nextDark ? 'dark' : 'light');
  }

  window.applyTheme = applyTheme;
  window.toggleTheme = toggleTheme;

  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    applyTheme(saved !== 'light');
  }

  function closeMobileMenu() {
    const button = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');

    if (!button || !menu) return;

    menu.classList.remove('active');
    button.textContent = '☰';
    button.setAttribute('aria-expanded', 'false');
  }

  function initMobileMenu() {
    const button = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');

    if (!button || !menu || button.dataset.menuReady === 'true') return;

    button.dataset.menuReady = 'true';

    button.addEventListener('click', event => {
      event.stopPropagation();
      const opened = menu.classList.toggle('active');
      button.textContent = opened ? '✕' : '☰';
      button.setAttribute('aria-expanded', String(opened));
    });

    menu.querySelectorAll('a, button').forEach(item => {
      item.addEventListener('click', () => {
        if (!item.matches('[onclick*="toggleTheme"]')) closeMobileMenu();
      });
    });

    document.addEventListener('click', event => {
      if (!menu.contains(event.target) && !button.contains(event.target)) {
        closeMobileMenu();
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMobileMenu();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) closeMobileMenu();
    });
  }

  function preventIOSPhoneStyling() {
    let meta = document.querySelector('meta[name="format-detection"]');

    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'format-detection';
      document.head.appendChild(meta);
    }

    meta.content = 'telephone=no';
  }

  function init() {
    preventIOSPhoneStyling();
    initTheme();
    initMobileMenu();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
