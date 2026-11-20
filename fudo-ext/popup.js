const k = document.getElementById('k'), r = document.getElementById('r'), st = document.getElementById('st');
const show = async () => {
  const { clave, ultimo, repartidor } = await chrome.storage.local.get(['clave', 'ultimo', 'repartidor']);
  k.value = clave || ''; r.value = repartidor || 'MOTOO';
  st.textContent = !clave ? 'Todavía no hay clave.' : ultimo ? 'Último envío: #' + ultimo.id + (ultimo.ok ? ' ✓' : ' ✗ ' + (ultimo.msg || '')) + ' · ' + new Date(ultimo.t).toLocaleTimeString('es-AR') : 'Clave guardada. Esperando pedidos.';
};
document.getElementById('g').onclick = async () => { await chrome.storage.local.set({ clave: k.value.trim(), repartidor: r.value.trim() || 'MOTOO' }); st.textContent = 'Guardado ✓'; setTimeout(show, 1200); };
show();
