(() => {
  'use strict';

  const THEME_KEY = 'dup-theme';

  function aplicarTema(tema) {
    const oscuro = tema === 'dark';
    document.body.classList.toggle('dark-mode', oscuro);
    document.documentElement.classList.toggle('dark-mode', oscuro);
    document.documentElement.dataset.theme = tema;

    const iconoDesktop = document.getElementById('theme-icon');
    const iconoMovil = document.getElementById('mobile-theme-icon');

    if (iconoDesktop) iconoDesktop.textContent = oscuro ? '☀️' : '🌙';
    if (iconoMovil) iconoMovil.textContent = oscuro ? '☀️' : '🌙';
  }

  function cambiarTema() {
    const nuevoTema = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, nuevoTema);
    aplicarTema(nuevoTema);
  }

  function iniciarMenuMovil() {
    const botonMenu = document.getElementById('mobile-menu-btn') || document.querySelector('.mobile-menu-btn');
    const menu = document.getElementById('mobile-menu') || document.querySelector('.mobile-menu');

    if (!botonMenu || !menu) {
      console.warn('[UI] No se encontró el botón o el menú móvil.');
      return;
    }

    const cerrarMenu = () => {
      menu.classList.remove('active');
      botonMenu.classList.remove('active');
      botonMenu.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-mobile-open');
    };

    const alternarMenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const abrir = !menu.classList.contains('active');
      menu.classList.toggle('active', abrir);
      botonMenu.classList.toggle('active', abrir);
      botonMenu.setAttribute('aria-expanded', String(abrir));
      document.body.classList.toggle('menu-mobile-open', abrir);
    };

    botonMenu.onclick = alternarMenu;

    menu.querySelectorAll('a').forEach((enlace) => {
      enlace.addEventListener('click', cerrarMenu);
    });

    document.addEventListener('click', (event) => {
      if (!menu.classList.contains('active')) return;
      if (menu.contains(event.target) || botonMenu.contains(event.target)) return;
      cerrarMenu();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) cerrarMenu();
    });
  }

  function iniciarTema() {
    const guardado = localStorage.getItem(THEME_KEY);
    aplicarTema(guardado === 'dark' ? 'dark' : 'light');

    const botonDesktop = document.getElementById('theme-toggle');
    const botonMovil = document.getElementById('mobile-theme-toggle');

    if (botonDesktop) {
      botonDesktop.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        cambiarTema();
      };
    }

    if (botonMovil) {
      botonMovil.onclick = (event) => {
        event.preventDefault();
        cambiarTema();
      };
    }
  }

  function iniciarUI() {
    iniciarTema();
    iniciarMenuMovil();
  }

  window.toggleTheme = cambiarTema;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarUI, { once: true });
  } else {
    iniciarUI();
  }
})();
