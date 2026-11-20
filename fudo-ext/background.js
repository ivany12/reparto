/* Manda el pedido a la bandeja (inbox) de Shivos Reparto en Firestore. Sin login: usa la clave que se pegó en el ícono de la extensión. */
const PROJECT = 'shivos-gestion', LOCAL = 'shivos', API_KEY = 'AIzaSyCIfBIxEcgK1NfBxODlb-Zfwj2jlFudZXI';
const S = v => ({ stringValue: String(v) }), I = v => ({ integerValue: String(Math.round(+v || 0)) });
async function enviar(p) {
  const { clave } = await chrome.storage.local.get('clave');
  if (!clave) return { ok: false, nokey: true, error: 'falta la clave (tocá el ícono de la extensión)' };
  const url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/reparto/' + LOCAL + '/inbox/f' + encodeURIComponent(p.fudo) + '?key=' + API_KEY;
  const body = { fields: { key: S(clave), fudo: S(p.fudo), nombre: S(p.nombre), tel: S(p.tel), dir: S(p.dir), total: I(p.total), cobrar: I(p.cobrar), pago: S(p.pago), origen: S(p.origen || ''), t: I(p.t) } };
  try {
    const r = await fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) { await chrome.storage.local.set({ ultimo: { id: p.fudo, t: Date.now(), ok: true } }); return { ok: true }; }
    const msg = r.status === 403 ? 'clave incorrecta o reglas sin publicar' : 'error ' + r.status;
    await chrome.storage.local.set({ ultimo: { id: p.fudo, t: Date.now(), ok: false, msg } });
    return { ok: false, error: msg };
  } catch (e) { return { ok: false, error: 'sin conexión' }; }
}
chrome.runtime.onMessage.addListener((m, _s, reply) => { if (m && m.type === 'send') { enviar(m.pedido).then(reply); return true; } });
