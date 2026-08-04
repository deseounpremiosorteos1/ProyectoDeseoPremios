# Deseo un Premio — Frontend limpio

Este paquete conserva la lógica actual del proyecto y reorganiza la presentación para evitar
hojas de estilo superpuestas.

## Estructura

```text
sorteos/
├── admin/
│   ├── admin.css
│   ├── admin.js
│   ├── dashboard.html
│   └── index.html
├── assets/
├── config.js
├── index.html
├── mis-tickets.html
├── participar.html
├── participar.css
├── participar.js
├── script.js
├── styles.css
├── tickets.css
├── tickets.js
└── ui.js
```

## Qué se limpió

- La página principal carga solo `styles.css`.
- Participar carga solo `participar.css`.
- Mis Tickets carga solo `tickets.css`.
- El administrador carga solo `admin/admin.css`.
- Se eliminó la dependencia de:
  - `tema-global.css`
  - `tema-global.js`
  - `tema-verde.css`
  - `lineas-doradas.css`
  - `assets/lineas-doradas.svg`
- El comportamiento común de tema y menú móvil está centralizado en `ui.js`.
- Se corrigió la detección automática de teléfonos en iPhone.
- Se mantuvieron intactos `script.js`, `participar.js`, `tickets.js` y `admin.js`.

## Instalación segura

1. Haz una copia de seguridad de tu carpeta actual `sorteos`.
2. Reemplaza la carpeta `sorteos` por la incluida en este paquete.
3. Conserva tus imágenes reales dentro de `assets` si son más recientes.
4. Prueba localmente:
   - `index.html`
   - `participar.html?sorteo=<ID>`
   - `mis-tickets.html`
   - `admin/`
5. Sube a GitHub:

```bash
git add sorteos
git commit -m "Limpiar y unificar frontend responsive"
git push origin master
```

## Archivos antiguos que ya no se necesitan

```text
tema-global.css
tema-global.js
tema-verde.css
lineas-doradas.css
assets/lineas-doradas.svg
```

No borres `config.js` ni los JavaScript funcionales de cada página.


## Versión premium exacta

Esta versión agrega:
- Hero verde oscuro con ornamentación dorada lateral.
- Logo con halo y plataforma luminosa.
- Botón «Ver sorteos activos».
- Tarjeta profesional de error con botón Reintentar.
- Responsive específico para Android, iPhone, tablet y escritorio.


## Ajuste adicional aplicado

- Se reemplazó `assets/logo.png` por el nuevo logo suministrado.
- El cambio se refleja automáticamente en:
  - Inicio
  - Participar
  - Mis Tickets
  - Login del administrador
  - Dashboard del administrador
- El footer azul fue reemplazado por un footer verde esmeralda con detalles dorados.


## Ajuste final del logo

El logo nuevo ahora se muestra circular en:

- Encabezado
- Hero principal
- Participar
- Mis Tickets
- Login del administrador
- Dashboard del administrador

Se aplicó `clip-path` y `border-radius` para eliminar visualmente las esquinas
oscuras de la imagen cuadrada original.
