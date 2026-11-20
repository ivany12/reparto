/* Lectura del pedido abierto en Fudo (pantalla Delivery). Todo por texto/etiquetas, no por clases de CSS, para que sobreviva a cambios de diseño. */
(function (root) {
  const nrm = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const LABELS_RAW = ['Recepción', 'Origen', 'Tipo', 'Retira', 'Cliente', 'Teléfono', 'Dirección', 'Seguimiento', 'Estado', 'Hora de retiro', 'Observaciones', 'Nota'];
  const LABELS = LABELS_RAW.map(nrm), isLabel = x => LABELS.includes(nrm(x)), labelKey = x => LABELS_RAW[LABELS.indexOf(nrm(x))];
  const money = s => { const m = String(s || '').match(/\$\s*([\d.]+)(?:,(\d{1,2}))?/); return m ? Math.round(parseFloat(m[1].replace(/\./g, '') + '.' + (m[2] || '0'))) : null; };
  const lines = t => String(t || '').split(/\n+/).map(x => x.trim()).filter(Boolean);

  /* Saca "Comuna 11", "Ciudad Autónoma de Buenos Aires", "Argentina" y el punto final de la dirección de Fudo. */
  function limpiarDir(raw) {
    const parts = String(raw || '').replace(/\s*\.\s*$/, '').split(',').map(x => x.trim()).filter(Boolean)
      .filter(x => !/^comuna\s*\d+$/i.test(x) && !/^ciudad aut[oó]noma de buenos aires$/i.test(x) && !/^argentina$/i.test(x) && !/^provincia de buenos aires$/i.test(x));
    return parts.join(', ').replace(/^calle\s+/i, '');
  }

  /* texto de la pantalla -> pedido abierto, o null si no hay uno */
  function parsePedido(text) {
    const L = lines(text);
    const i0 = L.findIndex(x => /^PEDIDO\s*#\d+/i.test(x));
    if (i0 < 0) return null;
    const id = L[i0].match(/#(\d+)/)[1];
    const F = {};
    let i = i0 + 1, fin = L.length;
    for (let k = i; k < L.length; k++) if (/^ADICIONES$/i.test(L[k])) { fin = k; break; }
    for (; i < fin; i++) {
      if (!isLabel(L[i])) continue;
      const next = L[i + 1];
      F[labelKey(L[i])] = next === undefined || isLabel(next) || i + 1 >= fin ? '' : next;
    }
    // total y pagos (después de las adiciones)
    let total = null; const pagos = [];
    for (let k = fin; k < L.length; k++) {
      if (/^Total:?$/i.test(L[k]) && total === null) total = money(L[k + 1]);
      if (/^PAGOS?$/i.test(L[k])) {
        for (let j = k + 1; j < L.length; j++) {
          if (money(L[j]) === null && money(L[j + 1]) !== null) { pagos.push({ metodo: L[j], monto: money(L[j + 1]) }); j++; }
          else if (money(L[j]) === null && !/^(total|cambio|vuelto|propina)/i.test(L[j]) && j + 1 >= L.length) break;
        }
        break;
      }
    }
    const pagado = pagos.filter(p => !/efectivo/i.test(p.metodo)).reduce((a, p) => a + p.monto, 0);
    return {
      id, recepcion: F['Recepción'] || '', origen: F['Origen'] || '', tipo: F['Tipo'] || '', cliente: F['Cliente'] || '', tel: F['Teléfono'] || '',
      dirRaw: F['Dirección'] || '', dir: limpiarDir(F['Dirección']), estado: F['Estado'] || '', total: total || 0, pagos,
      cobrar: Math.max(0, (total || 0) - pagado),
      pago: pagos.length ? pagos.map(p => p.metodo + ' $' + p.monto.toLocaleString('es-AR')).join(' · ') : 'Sin pago registrado'
    };
  }

  /* ¿Es un delivery propio que tiene que ir a Reparto? Devuelve null si sí, o el motivo por el que no. */
  function motivoNo(p, ahora) {
    if (!p) return 'sin pedido';
    if (!/domicilio/i.test(p.tipo)) return 'no es a domicilio';
    if (/rappi|pedidos\s*ya|pedidosya/i.test(p.origen)) return 'es de una app de delivery';
    if (/\*/.test(p.tel)) return 'teléfono oculto (app)';
    if (!p.dir) return 'sin dirección';
    if (!/^confirmado$/i.test(p.estado)) return 'todavía no confirmado';
    const m = p.recepcion.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})/);
    if (m) {
      const y = +m[3] < 100 ? 2000 + +m[3] : +m[3], t = new Date(y, +m[2] - 1, +m[1], +m[4], +m[5]).getTime();
      if ((ahora || Date.now()) - t > 4 * 3600 * 1000) return 'pedido viejo';
    }
    return null;
  }
  /* Filas de las tablas "En preparación" y "Listo para entregar" de la pantalla Delivery (columnas por nombre de encabezado). */
  function parseFilas(doc) {
    const out = [];
    doc.querySelectorAll('table').forEach(t => {
      if (!/tint-delivery-(preparing|ready-to-deliver)/.test(t.className)) return;
      const heads = [...t.querySelectorAll('thead th')].map(x => nrm(x.textContent));
      const ix = n => heads.indexOf(nrm(n));
      t.querySelectorAll('tbody tr').forEach(tr => {
        const th = tr.querySelector('th.col-id, th'); if (!th || tr.classList.contains('empty')) return;
        const id = (th.textContent.match(/\d+/) || [])[0]; if (!id) return;
        const cells = [...tr.children], g = n => { const i = ix(n); return i >= 0 && cells[i] ? cells[i].textContent.replace(/\s+/g, ' ').trim() : ''; };
        out.push({ id, el: tr, hora: g('hora inicio'), dirRaw: g('dirección'), dir: limpiarDir(g('dirección')), tel: g('teléfono'), cliente: g('cliente'), total: money(g('total')) || 0, tabla: /ready/.test(t.className) ? 'listo' : 'prep' });
      });
    });
    return out;
  }
  /* ¿Esta fila parece un delivery propio (dirección y teléfono reales)? Devuelve el motivo si no. */
  function motivoFila(r, ahora) {
    if (!r.dir || r.dir === '-') return 'sin dirección';
    if (!r.tel || /\*/.test(r.tel)) return 'teléfono oculto o vacío';
    const m = r.hora.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})/);
    if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3], t = new Date(y, +m[2] - 1, +m[1], +m[4], +m[5]).getTime(); if ((ahora || Date.now()) - t > 4 * 3600 * 1000) return 'pedido viejo'; }
    return null;
  }
  root.FudoLib = { parsePedido, motivoNo, limpiarDir, money, parseFilas, motivoFila };
})(typeof window !== 'undefined' ? window : globalThis);
