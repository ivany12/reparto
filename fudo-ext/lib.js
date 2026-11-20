/* Lectura del pedido abierto en Fudo (pantalla Delivery). Todo por texto/etiquetas, no por clases de CSS, para que sobreviva a cambios de diseño. */
(function (root) {
  const nrm = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const LABELS_RAW = ['Recepción', 'Origen', 'Tipo', 'Retira', 'Cliente', 'Teléfono', 'Dirección', 'Seguimiento', 'Estado', 'Hora de retiro', 'Observaciones', 'Nota'];
  const LABELS = LABELS_RAW.map(nrm), isLabel = x => LABELS.includes(nrm(x)), labelKey = x => LABELS_RAW[LABELS.indexOf(nrm(x))];
  const money = s => { const m = String(s || '').match(/\$\s*([\d.]+)(?:,(\d{1,2}))?/); return m ? Math.round(parseFloat(m[1].replace(/\./g, '') + '.' + (m[2] || '0'))) : null; };
  const lines = t => String(t || '').split(/\n+/).map(x => x.trim()).filter(Boolean);

  /* Dirección de Fudo -> { dir, depto }. Fudo agrega el piso/depto después de "Argentina ." (ej. "…, Argentina . 3/4"). "S/N" no cuenta. */
  function partirDir(raw) {
    let depto = '';
    const t = String(raw || '').replace(/\s+/g, ' ').trim();
    const m = t.match(/Argentina\s*\.\s*(.*)$/i);
    if (m) { depto = m[1].trim(); if (/^s\s*\/?\s*n$/i.test(depto)) depto = ''; }
    return { dir: limpiarDir(m ? t.slice(0, m.index + 'Argentina'.length) : t), depto: depto.slice(0, 60) };
  }
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
    for (let k = i; k < L.length; k++) if (/^ADICION(ES|AR)$/i.test(L[k])) { fin = k; break; }
    for (; i < fin; i++) {
      if (!isLabel(L[i])) continue;
      const next = L[i + 1];
      F[labelKey(L[i])] = next === undefined || isLabel(next) || i + 1 >= fin ? '' : next;
    }
    // total y pagos (después de las adiciones)
    let total = null, vuelto = 0; const pagos = [];
    for (let k = fin; k < L.length; k++) {
      if (/^Total:?(\s*\$.*)?$/i.test(L[k]) && total === null) total = money(L[k]) !== null ? money(L[k]) : money(L[k + 1]);
      // En Fudo la sección se llama "PAGA CON" (antes se buscaba "PAGO"): "Qr $19.900,00", "Efectivo $25.000,00", "Vuelto: $5.100,00".
      if (/^(PAGOS?|PAGA\s+CON)$/i.test(L[k])) {
        for (let j = k + 1; j < L.length; j++) {
          if (/^detalles\s+del\s+env/i.test(L[j])) break;
          // "Método $monto" en una sola línea, o método y monto en líneas separadas
          let nom = null, monto = null;
          const un = L[j].match(/^(.+?)\s*:?\s+(\$\s*[\d.]+(?:,\d{1,2})?)$/);
          if (un) { nom = un[1]; monto = money(un[2]); }
          else if (money(L[j]) === null && money(L[j + 1]) !== null) { nom = L[j]; monto = money(L[j + 1]); j++; }
          if (nom === null) continue;
          if (/^vuelto$/i.test(nom.replace(/:$/, '').trim())) vuelto = monto;
          else if (!/^(total|cambio|propina)/i.test(nom)) pagos.push({ metodo: nom.replace(/:$/, '').trim(), monto });
        }
        break;
      }
    }
    const pagado = pagos.filter(p => !/efectivo/i.test(p.metodo)).reduce((a, p) => a + p.monto, 0);
    const pagoTxt = pagos.map(p => p.metodo + ' $' + p.monto.toLocaleString('es-AR')).join(' · ') + (vuelto > 0 ? ' · vuelto $' + vuelto.toLocaleString('es-AR') : '');
    return {
      id, recepcion: F['Recepción'] || '', origen: F['Origen'] || '', tipo: F['Tipo'] || '', cliente: F['Cliente'] || '', tel: F['Teléfono'] || '',
      dirRaw: F['Dirección'] || '', dir: partirDir(F['Dirección']).dir, depto: partirDir(F['Dirección']).depto, estado: F['Estado'] || '', total: total || 0, pagos,
      cobrar: Math.max(0, (total || 0) - pagado), pagado, vuelto,
      pago: pagos.length ? pagoTxt : 'Sin pago registrado'
    };
  }

  /* ¿Es un delivery propio que tiene que ir a Reparto? Devuelve null si sí, o el motivo por el que no. */
  /* explicito = la caja le asignó el repartidor de Reparto en Fudo: ahí se confía en esa señal (no se filtra por origen, teléfono ni estado). */
  function motivoNo(p, ahora, explicito) {
    if (!p) return 'sin pedido';
    if (!explicito && !/domicilio/i.test(p.tipo)) return 'no es a domicilio';
    if (!explicito && /rappi|pedidos\s*ya|pedidosya/i.test(p.origen)) return 'es de una app de delivery';
    if (!explicito && /\*/.test(p.tel)) return 'teléfono oculto (app)';
    if (!p.dir) return 'sin dirección';
    if (!explicito && !/^confirmado$/i.test(p.estado)) return 'todavía no confirmado';
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
        out.push({ id, el: tr, hora: g('hora inicio'), dirRaw: g('dirección'), dir: partirDir(g('dirección')).dir, tel: g('teléfono'), cliente: g('cliente'), rep: g('repartidor'), depto: partirDir(g('dirección')).depto, total: money(g('total')) || 0, tabla: /ready/.test(t.className) ? 'listo' : 'prep' });
      });
    });
    return out;
  }
  /* ¿Esta fila parece un delivery propio (dirección y teléfono reales)? Devuelve el motivo si no. */
  function motivoFila(r, ahora) {
    if (!r.dir || r.dir === '-') return 'sin dirección';
    const m = r.hora.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})/);
    if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3], t = new Date(y, +m[2] - 1, +m[1], +m[4], +m[5]).getTime(); if ((ahora || Date.now()) - t > 4 * 3600 * 1000) return 'pedido viejo'; }
    return null;
  }
  const esRep = (r, nombre) => nrm(r.rep) === nrm(nombre || 'MOTOO');
  root.FudoLib = { parsePedido, motivoNo, limpiarDir, partirDir, money, parseFilas, motivoFila, esRep };
})(typeof window !== 'undefined' ? window : globalThis);
