/* Shivos · Fudo a Reparto — corre dentro de app-v2.fu.do (pantalla Delivery).
   1) Mira las tablas "En preparación" / "Listo para entregar": cada pedido nuevo con dirección y teléfono reales es un delivery propio.
   2) Para saber si ya está pagado, lee el detalle (Pago). Si la caja no lo tiene abierto, lo abre un instante solo cuando nadie está usando la pantalla, y vuelve a donde estaba.
   3) Lo manda a Reparto (service worker -> Firestore). Si no pudo leer el pago, lo manda igual a los 25 s con "Sin verificar" (el repartidor cobra el total por las dudas). */
(() => {
  if (window.__shivosReparto) return; window.__shivosReparto = true;
  const { parsePedido, motivoNo, parseFilas, motivoFila } = window.FudoLib;
  const S = { sent: {}, seen: {}, tries: {}, busy: false, lastInput: 0, own: false, last: null };
  const store = chrome.storage.local;
  store.get('sent').then(r => { S.sent = r.sent || {}; }).catch(() => { });
  const save = () => { const keys = Object.keys(S.sent); if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(k => delete S.sent[k]); store.set({ sent: S.sent }).catch(() => { }); };
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'].forEach(ev => addEventListener(ev, () => { if (!S.own) S.lastInput = Date.now(); }, true));

  /* cartelito abajo a la izquierda */
  let badge = null, bt = 0;
  function say(kind, text, sticky) {
    if (!badge) {
      badge = document.createElement('div'); badge.id = 'shivos-reparto-badge';
      badge.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483647;font:600 13px/1.3 system-ui,Segoe UI,sans-serif;padding:8px 12px;border-radius:10px;box-shadow:0 2px 10px #0006;cursor:pointer;max-width:340px;display:none';
      badge.title = 'Shivos Reparto · tocá para reenviar el último pedido';
      badge.onclick = () => { if (S.last) { delete S.sent[S.last]; save(); say('ok', 'Reenviando #' + S.last + '…'); } };
      document.body.appendChild(badge);
    }
    const c = { ok: ['#F1BB00', '#000'], warn: ['#ff8a5c', '#000'], err: ['#e5484d', '#fff'] }[kind];
    badge.style.background = c[0]; badge.style.color = c[1]; badge.textContent = '🛵 Reparto: ' + text; badge.style.display = 'block';
    clearTimeout(bt); if (!sticky) bt = setTimeout(() => { badge.style.display = 'none'; }, 9000);
  }

  const panelId = () => { const p = parsePedido(document.body.innerText); return p; };
  const quiet = () => {
    const a = document.activeElement, ed = a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable);
    return !S.busy && !ed && Date.now() - S.lastInput > 4000 && /^#!\/delivery/.test(location.hash) && !document.querySelector('.modal.in, .modal.show, [role=dialog]');
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function enviar(d, final) {
    const hash = [d.nombre, d.tel, d.dir, d.cobrar, final ? 'f' : 'p'].join('|');
    if (S.sent[d.id] === hash) return;
    S.sent[d.id] = hash; S.last = d.id; save();
    const pedido = { fudo: d.id, nombre: String(d.nombre || 'Cliente').slice(0, 80), tel: String(d.tel || '').slice(0, 30), dir: String(d.dir).slice(0, 200), total: Math.round(d.total || 0), cobrar: Math.round(d.cobrar || 0), pago: String(d.pago || 'Sin verificar').slice(0, 120), origen: String(d.origen || '').slice(0, 40), t: Date.now() };
    chrome.runtime.sendMessage({ type: 'send', pedido }).then(r => {
      if (r && r.ok) say('ok', 'pedido #' + d.id + ' enviado' + (final ? '' : ' (pago sin verificar)'));
      else { delete S.sent[d.id]; save(); say(r && r.nokey ? 'warn' : 'err', (r && r.error) || 'no se pudo enviar #' + d.id, true); }
    }).catch(e => { delete S.sent[d.id]; save(); say('err', 'no se pudo enviar #' + d.id, true); });
  }

  /* Abre el detalle de la fila un instante, lo lee y vuelve a donde estaba. */
  async function leerDetalle(row) {
    S.busy = true;
    const prev = location.hash;
    try {
      S.own = true; row.el.click(); S.own = false;
      let p = null;
      for (let i = 0; i < 30; i++) { await sleep(100); const q = panelId(); if (q && q.id === row.id && q.estado) { p = q; break; } }
      return p;
    } finally {
      if (location.hash !== prev) { S.own = true; location.hash = prev; setTimeout(() => { S.own = false; }, 300); }
      S.busy = false;
    }
  }

  async function tick() {
    try {
      const now = Date.now();
      // 1) el detalle que la caja ya tiene abierto
      const open = panelId();
      if (open && !motivoNo(open, now)) enviar({ ...open, nombre: open.cliente }, true);
      // 2) pedidos nuevos en las tablas
      for (const r of parseFilas(document)) {
        if (motivoFila(r, now)) continue;
        if (S.sent[r.id] && /\|f$/.test(S.sent[r.id])) continue;
        S.seen[r.id] = S.seen[r.id] || now;
        if (open && open.id === r.id) continue;
        if ((S.tries[r.id] || 0) < 3 && quiet()) {
          S.tries[r.id] = (S.tries[r.id] || 0) + 1;
          const p = await leerDetalle(r);
          if (p && !motivoNo(p, now)) { enviar({ ...p, nombre: p.cliente }, true); continue; }
          if (p && motivoNo(p, now) && motivoNo(p, now) !== 'todavía no confirmado') { S.sent[r.id] = 'x|f'; continue; } // no es nuestro (app de delivery, etc.)
        }
        if (!S.sent[r.id] && now - S.seen[r.id] > 25000) enviar({ id: r.id, nombre: r.cliente, tel: r.tel, dir: r.dir, total: r.total, cobrar: r.total, pago: 'Sin verificar', origen: '' }, false);
      }
    } catch (e) { console.warn('Shivos Reparto', e); }
  }
  setInterval(tick, 2500);
})();
