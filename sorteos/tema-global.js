(() => {
  'use strict';

  const STORAGE_KEY = 'dup-theme';

  function aplicarTema(tema) {
    const oscuro = tema === 'dark';

    document.body.classList.toggle('dark-mode', oscuro);
    document.documentElement.classList.toggle('dark-mode', oscuro);
    document.documentElement.setAttribute('data-theme', tema);

    const icono = document.getElementById('theme-icon');
    const iconoMovil = document.getElementById('mobile-theme-icon');

    if (icono) icono.textContent = oscuro ? '☀️' : '🌙';
    if (iconoMovil) iconoMovil.textContent = oscuro ? '☀️' : '🌙';

    localStorage.setItem(STORAGE_KEY, tema);
  }

  function cambiarTema() {
    const nuevoTema = document.body.classList.contains('dark-mode')
      ? 'light'
      : 'dark';

    aplicarTema(nuevoTema);
  }

  function iniciar() {
    const guardado = localStorage.getItem(STORAGE_KEY);
    aplicarTema(guardado === 'dark' ? 'dark' : 'light');

    const boton = document.getElementById('theme-toggle');
    const botonMovil = document.getElementById('mobile-theme-toggle');

    if (boton) {
      boton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        cambiarTema();
      };
    }

    if (botonMovil) {
      botonMovil.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        cambiarTema();
      };
    }
  }

  window.toggleTheme = cambiarTema;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  } else {
    iniciar();
  }
})();
