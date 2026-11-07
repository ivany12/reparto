/* Morfi · utilidades de ubicación y seguimiento de delivery.
   Script clásico: expone window.GEO (lo usan la app, track.html y reparto.html). */
(function () {
  'use strict';
  // Caja aproximada del AMBA: descarta resultados de geocodificación que caen lejos.
  const BOX = { lat: [-35.2, -34.2], lng: [-59.3, -57.9] };
  const inBox = p => p && isFinite(p.lat) && isFinite(p.lng) && p.lat > BOX.lat[0] && p.lat < BOX.lat[1] && p.lng > BOX.lng[0] && p.lng < BOX.lng[1];

  /* Celular argentino -> formato internacional que pide wa.me (54 9 + área + número, sin 0 ni 15). */
  function waPhone(tel) {
    let d = String(tel || '').replace(/\D/g, '');
    if (d.indexOf('54') === 0) d = d.slice(2);
    if (d.charAt(0) === '9' && d.length === 11) d = d.slice(1);
    d = d.replace(/^0+/, '');
    if (d.length === 12) { for (let a = 2; a <= 4; a++) { if (d.substr(a, 2) === '15') { d = d.slice(0, a) + d.slice(a + 2); break; } } }
    return '549' + d;
  }

  /* Distancia en metros entre dos puntos {lat,lng}. */
  function dist(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  /* Rumbo en grados (0 = norte) de a hacia b. */
  function bearing(a, b) {
    const rad = Math.PI / 180, dLng = (b.lng - a.lng) * rad;
    const y = Math.sin(dLng) * Math.cos(b.lat * rad);
    const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos(dLng);
    return (Math.atan2(y, x) / rad + 360) % 360;
  }

  /* Minutos estimados desde `from` pasando por `stops` (en orden, hasta el pedido que interesa, inclusive).
     Línea recta x 1,35 a ~17 km/h de promedio urbano + 2 min por cada parada intermedia. Devuelve null si falta una coordenada. */
  function etaMin(from, stops) {
    if (!from || !stops || !stops.length) return null;
    const V = 17000 / 60; // metros por minuto
    let prev = from, mins = 0;
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      if (!s || !isFinite(s.lat) || !isFinite(s.lng)) return null;
      mins += dist(prev, s) * 1.35 / V + (i > 0 ? 2 : 0);
      prev = s;
    }
    return Math.max(1, Math.round(mins));
  }

  const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';

  /* Token de seguimiento: 12 caracteres sin letras ambiguas (~60 bits). */
  function token() {
    const A = 'abcdefghjkmnpqrstuvwxyz23456789', b = new Uint8Array(12);
    (self.crypto || window.crypto).getRandomValues(b);
    return Array.from(b, x => A[x % A.length]).join('');
  }

  /* Dirección -> {lat,lng,src} o null. Primero Georef (API oficial de direcciones de Argentina), después Nominatim. */
  async function geocode(dir) {
    dir = String(dir || '').trim();
    if (!dir) return null;
    const m = dir.match(/^(.*?\d{1,5})/); // calle + altura; descarta piso/depto
    const q = (m ? m[1] : dir).replace(/\s+/g, ' ').trim();
    const get = async url => {
      try {
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
        const r = await fetch(url, { signal: ctl.signal }); clearTimeout(t);
        return r.ok ? await r.json() : null;
      } catch (e) { return null; }
    };
    let j = await get('https://apis.datos.gob.ar/georef/api/direcciones?max=1&provincia=02&direccion=' + encodeURIComponent(q));
    let u = j && j.direcciones && j.direcciones[0] && j.direcciones[0].ubicacion;
    if (u && inBox({ lat: u.lat, lng: u.lon })) return { lat: +u.lat, lng: +u.lon, src: 'georef' };
    j = await get('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ar&q=' + encodeURIComponent(q + ', Buenos Aires'));
    u = Array.isArray(j) && j[0];
    if (u && inBox({ lat: +u.lat, lng: +u.lon })) return { lat: +u.lat, lng: +u.lon, src: 'osm' };
    return null;
  }

  window.GEO = { waPhone, dist, bearing, etaMin, firstName, token, geocode, inBox };
})();
