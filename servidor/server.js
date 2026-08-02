// ════════════════════════════════════════════════════════════════
// PARCHE para server.js
// ════════════════════════════════════════════════════════════════
// Dentro de la ruta app.post('/api/comprobantes', ...), busca el bloque
// que calcula "totalLineal" y "monto" (justo después de leer
// precio_ticket del sorteo) y reemplaza SOLO el cálculo de "monto" por
// lo que sigue. No toca nada de la subida de Cloudinary, el OCR, ni el
// resto de la ruta.
//
// Antes de este bloque debe seguir existiendo (sin cambios):
//   const sorteoR = await cliente.query('SELECT precio_ticket FROM sorteos WHERE id = $1', [sorteo_id]);
//   if (!sorteoR.rows[0]) throw new Error('Sorteo no encontrado');
//   const precioTicket = Number(sorteoR.rows[0].precio_ticket);
//   const totalLineal = precioTicket * Number(cantidad);
// ════════════════════════════════════════════════════════════════

// Descuento SOLO en 3, 5, 7, 9 o 10 tickets — cualquier otra cantidad paga
// el precio normal. El monto final se recalcula siempre acá en el
// servidor (nunca se confía en el que manda el navegador) — así nadie
// puede inventar un descuento desde las herramientas de desarrollador.
const PORCENTAJES_POR_COMBO = { 3: 11, 5: 12, 7: 13, 9: 14, 10: 15 };
const cant = Number(cantidad);
const porcentajeDescuento = PORCENTAJES_POR_COMBO[cant] || 0;
const monto = porcentajeDescuento > 0
  ? Math.max(0, Math.round(totalLineal * (1 - porcentajeDescuento / 100)))
  : totalLineal;

// El resto de la ruta sigue igual: el INSERT usa esta misma variable
// "monto" tal cual ya la tenías.
