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

  const getJson = async url => {
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(url, { signal: ctl.signal }); clearTimeout(t);
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  };
  const ABBR = [[/\b(?:pje|psje)\b\.?/gi, 'Pasaje'], [/\bav\b\.?/gi, 'Avenida'], [/\bgral\b\.?/gi, 'General'], [/\bdr\b\.?/gi, 'Doctor'], [/\bcnel\b\.?/gi, 'Coronel'], [/\bing\b\.?/gi, 'Ingeniero'], [/\bpres\b\.?/gi, 'Presidente'], [/\bsta\b\.?/gi, 'Santa'], [/\bsto\b\.?/gi, 'Santo'], [/\bbv\b\.?/gi, 'Boulevard']];
  const normDir = t => { ABBR.forEach(a => { t = t.replace(a[0], a[1]); }); return t.replace(/\s+/g, ' ').trim(); };
  const TIPO = /^(pasaje|avenida|calle|boulevard|diagonal|camino)\s+/i;
  const fromGeoref = d => {
    const u = d && d.ubicacion;
    if (!u || u.lat == null || !inBox({ lat: u.lat, lng: u.lon })) return null;
    return { lat: +u.lat, lng: +u.lon, label: d.nomenclatura || (d.calle && d.calle.nombre) || '', src: 'georef', exact: !!(d.altura && d.altura.valor != null) };
  };
  const fromOsm = x => {
    if (!x || !inBox({ lat: +x.lat, lng: +x.lon })) return null;
    return { lat: +x.lat, lng: +x.lon, label: String(x.display_name || '').split(',').slice(0, 4).join(','), src: 'osm', exact: !!(x.address && x.address.house_number) };
  };

  /* Dirección -> lista de candidatos [{lat,lng,label,src,exact}] (los exactos primero). Vacía si no encuentra nada.
     Prueba variantes del texto (Pje -> Pasaje, sin "Pasaje") en Georef (CABA y provincia de Buenos Aires) y, si no hay una exacta, en OpenStreetMap. */
  async function search(dir, near) {
    dir = String(dir || '').trim();
    if (dir.length < 4) return [];
    const m = dir.match(/^(.*?\d{1,5})/); // calle + altura; descarta piso/depto
    const base = normDir(m ? m[1] : dir);
    const vs = [...new Set([base, base.replace(TIPO, '')])].filter(Boolean);
    const out = [];
    // near = {lat,lng,km}: solo direcciones dentro de esa zona (ej. la zona de reparto del local). Las de afuera se cuentan en .lejos.
    let lejos = 0, lejosEj = '';
    const add = c => {
      if (!c) return;
      if (near && dist(c, near) > near.km * 1000) { lejos++; lejosEj = lejosEj || c.label; return; }
      if (!out.some(o => dist(o, c) < 30)) out.push(c);
    };
    const G = 'https://apis.datos.gob.ar/georef/api/direcciones?max=10&direccion=';
    const jobs = [];
    vs.forEach(q => ['02', '06'].forEach(prov => jobs.push(getJson(G + encodeURIComponent(q) + '&provincia=' + prov).then(j => ((j && j.direcciones) || []).forEach(d => add(fromGeoref(d)))))));
    await Promise.all(jobs);
    let vb = '';
    if (near) { const dl = near.km / 111, dg = near.km / (111 * Math.cos(near.lat * Math.PI / 180)); vb = '&bounded=1&viewbox=' + [near.lng - dg, near.lat + dl, near.lng + dg, near.lat - dl].map(x => x.toFixed(5)).join(','); }
    if (!out.some(c => c.exact)) {
      for (const q of vs.slice(0, 2)) {
        const j = await getJson('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&countrycodes=ar' + vb + '&q=' + encodeURIComponent(q + ', Buenos Aires'));
        (Array.isArray(j) ? j : []).forEach(x => add(fromOsm(x)));
      }
    }
    out.sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0));
    const res = out.slice(0, 5); res.lejos = lejos; res.lejosEj = lejosEj;
    return res;
  }
  /* Primer candidato como {lat,lng,src} o null. */
  async function geocode(dir, near) {
    const r = await search(dir, near);
    return r[0] ? { lat: r[0].lat, lng: r[0].lng, src: r[0].src } : null;
  }

  window.GEO = { waPhone, dist, bearing, etaMin, firstName, token, geocode, search, inBox };
})();
