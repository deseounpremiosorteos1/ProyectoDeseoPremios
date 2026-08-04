(() => {
  'use strict';

  const STORAGE_KEY = 'dup-theme';

  const getPreferredTheme = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;

    return window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  };

  const applyTheme = (theme) => {
    const dark = theme === 'dark';
    document.body.classList.toggle('dark-mode', dark);
    document.documentElement.dataset.theme = theme;

    const icon = document.getElementById('theme-icon');
    const mobileIcon = document.getElementById('mobile-theme-icon');
    const button = document.getElementById('theme-toggle');

    if (icon) icon.textContent = dark ? '☀️' : '🌙';
    if (mobileIcon) mobileIcon.textContent = dark ? '☀️' : '🌙';

    if (button) {
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute(
        'aria-label',
        dark ? 'Activar tema claro' : 'Activar tema oscuro'
      );
      button.title = dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
    }
  };

  const setTheme = (theme) => {
    localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
  };

  window.toggleTheme = () => {
    const next = document.body.classList.contains('dark-mode')
      ? 'light'
      : 'dark';

    setTheme(next);
  };

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(getPreferredTheme());

    const themeButton = document.getElementById('theme-toggle');
    const mobileThemeButton = document.getElementById('mobile-theme-toggle');
    const menuButton = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');

    themeButton?.addEventListener('click', window.toggleTheme);
    mobileThemeButton?.addEventListener('click', window.toggleTheme);

    const closeMenu = () => {
      if (!menu || !menuButton) return;
      menu.classList.remove('active');
      menuButton.setAttribute('aria-expanded', 'false');
    };

    menuButton?.addEventListener('click', () => {
      if (!menu) return;

      const opening = !menu.classList.contains('active');
      menu.classList.toggle('active', opening);
      menuButton.setAttribute('aria-expanded', String(opening));
    });

    menu?.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('click', (event) => {
      if (!menu || !menuButton || !menu.classList.contains('active')) return;
      if (menu.contains(event.target) || menuButton.contains(event.target)) return;
      closeMenu();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) closeMenu();
    });
  });
})();
