(() => {
  'use strict';

  const STORAGE_KEY = 'dup-theme';

  function savedTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'dark' || saved === 'light' ? saved : 'light';
  }

  function applyTheme(theme) {
    const dark = theme === 'dark';

    document.body.classList.toggle('dark-mode', dark);
    document.documentElement.classList.toggle('dark-mode', dark);
    document.documentElement.dataset.theme = theme;

    const desktopIcon = document.getElementById('theme-icon');
    const mobileIcon = document.getElementById('mobile-theme-icon');
    const desktopButton = document.getElementById('theme-toggle');

    if (desktopIcon) desktopIcon.textContent = dark ? '☀️' : '🌙';
    if (mobileIcon) mobileIcon.textContent = dark ? '☀️' : '🌙';

    if (desktopButton) {
      desktopButton.setAttribute('aria-pressed', String(dark));
      desktopButton.setAttribute(
        'aria-label',
        dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'
      );
      desktopButton.title = dark
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

  window.toggleTheme = toggleTheme;

  function initialize() {
    applyTheme(savedTheme());

    const desktopThemeButton = document.getElementById('theme-toggle');
    const mobileThemeButton = document.getElementById('mobile-theme-toggle');
    const menuButton = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');

    /*
     * Se usa onclick por asignación, no addEventListener, para evitar que
     * scripts antiguos registren el evento dos veces.
     */
    if (desktopThemeButton) {
      desktopThemeButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleTheme();
      };
    }

    if (mobileThemeButton) {
      mobileThemeButton.onclick = (event) => {
        event.preventDefault();
        toggleTheme();
      };
    }

    function closeMenu() {
      if (!mobileMenu || !menuButton) return;
      mobileMenu.classList.remove('active');
      menuButton.setAttribute('aria-expanded', 'false');
    }

    if (menuButton) {
      menuButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (!mobileMenu) return;

        const willOpen = !mobileMenu.classList.contains('active');
        mobileMenu.classList.toggle('active', willOpen);
        menuButton.setAttribute('aria-expanded', String(willOpen));
      };
    }

    mobileMenu?.querySelectorAll('a').forEach((link) => {
      link.onclick = closeMenu;
    });

    document.addEventListener('click', (event) => {
      if (!mobileMenu || !menuButton) return;
      if (!mobileMenu.classList.contains('active')) return;
      if (mobileMenu.contains(event.target) || menuButton.contains(event.target)) return;
      closeMenu();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) closeMenu();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
