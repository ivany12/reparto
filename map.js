/* Reparto · mapa base oscuro. Script clásico: window.baseMap(map).
   Usa el mapa vectorial gratis de OpenFreeMap (sin clave) repintado en negro/gris para que resalte el amarillo de Shivo's.
   Si algo falla (sin WebGL, sin red al estilo), cae a los tiles de OpenStreetMap oscurecidos con un filtro CSS. */
(function () {
  'use strict';
  var STYLE = 'https://tiles.openfreemap.org/styles/positron';
  var ATTR = '© OpenStreetMap · OpenFreeMap';

  function raster(map) {
    map.getContainer().classList.add('osm-dark');
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  }

  /* Repinta cualquier estilo vectorial en escala de grises según el tipo e id de cada capa. */
  function darken(st) {
    st.layers = (st.layers || []).filter(function (l) { return !/poi|aeroway|mountain_peak/.test(l.id) && l.type !== 'hillshade' && l.type !== 'fill-extrusion'; });
    st.layers.forEach(function (l) {
      var id = l.id, p = (l.paint = l.paint || {});
      if (l.type === 'background') p['background-color'] = '#121212';
      else if (l.type === 'fill') {
        delete p['fill-pattern']; delete p['fill-outline-color'];
        p['fill-color'] = /water/.test(id) ? '#050505' : /building/.test(id) ? '#1d1d1d' : /park|wood|forest|grass|green|garden/.test(id) ? '#161a14' : '#171717';
      } else if (l.type === 'line') {
        delete p['line-pattern'];
        p['line-color'] = /casing|bridge_.*_casing/.test(id) ? '#0c0c0c'
          : /motorway|trunk|primary/.test(id) ? '#4a4a4a'
          : /secondary|tertiary/.test(id) ? '#383838'
          : /water/.test(id) ? '#050505'
          : /boundary|admin/.test(id) ? '#2c2c2c' : '#2b2b2b';
      } else if (l.type === 'symbol') {
        p['text-color'] = /road|street|path|name_other|housenumber/.test(id) ? '#8a8a8a' : '#b8b8b8';
        p['text-halo-color'] = '#0b0b0b';
        p['text-halo-width'] = 1.4;
        delete p['icon-opacity'];
      }
    });
    return st;
  }

  window.baseMap = function (map) {
    if (!window.maplibregl || !L.maplibreGL) return raster(map);
    fetch(STYLE).then(function (r) { if (!r.ok) throw new Error('style'); return r.json(); }).then(function (st) {
      var gl = L.maplibreGL({ style: darken(st), attribution: ATTR });
      gl.addTo(map);
      // Si el lienzo WebGL no puede crearse, usar el mapa de respaldo.
      setTimeout(function () { try { if (!gl.getMaplibreMap()) raster(map); } catch (e) { raster(map); } }, 3000);
    }).catch(function () { raster(map); });
  };
  window.baseMap._darken = darken;
})();
