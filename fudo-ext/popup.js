const k = document.getElementById('k'), st = document.getElementById('st');
const show = async () => {
  const { clave, ultimo } = await chrome.storage.local.get(['clave', 'ultimo']);
  k.value = clave || '';
  st.textContent = !clave ? 'Todavía no hay clave.' : ultimo ? 'Último envío: #' + ultimo.id + (ultimo.ok ? ' ✓' : ' ✗ ' + (ultimo.msg || '')) + ' · ' + new Date(ultimo.t).toLocaleTimeString('es-AR') : 'Clave guardada. Esperando pedidos.';
};
document.getElementById('g').onclick = async () => { await chrome.storage.local.set({ clave: k.value.trim() }); st.textContent = 'Guardado ✓'; setTimeout(show, 1200); };
show();
