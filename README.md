# Shivo's Reparto

Sistema propio de delivery: panel del local, app del repartidor y página de seguimiento para el cliente. Sin servidor propio: GitHub Pages + Firebase (proyecto `shivos-gestion`).

| Archivo | Quién lo usa | Qué hace |
|---|---|---|
| `index.html` | El local (Ivan, quien atienda) | Carga pedidos, los pasa a Listo, los despacha, manda el link por WhatsApp, ve el mapa en vivo |
| `repartidor.html` | Nacho | Lista de paradas, "Llegué", "Entregado", cobro, comparte su ubicación |
| `track.html?t=TOKEN` | El cliente | Mapa con la moto en vivo, ETA y "entrega otro pedido antes" |
| `firestore.rules` | Firebase | Reglas de seguridad (incluye las de Morfi, pausado) |

## Puesta en marcha
1. Firebase Console → Firestore Database → **Reglas** → pegar todo `firestore.rules` → **Publicar**.
2. GitHub Pages (Settings → Pages → rama `main`, carpeta `/`).
3. Abrir `index.html` con `ivanyacar@gmail.com` → **Crear Shivo's** (solo la primera vez).
4. Ajustes → agregar repartidor (nombre + Gmail) y, si hace falta, más Gmails del equipo.
5. Nacho abre `repartidor.html` con su Gmail y deja la pantalla prendida mientras reparte.

## Flujo
Nuevo pedido → (se abre WhatsApp con el link, enviado desde el celu/PC del local) → Listo → Despachar con Nacho → él marca Llegué / Entregado.

## Datos (`reparto/shivos`)
`pedidos/{id}` privados · `track/{token}` público solo por token · `pos/{mail}` ubicación del repartidor.

## Límites conocidos
- La ubicación del repartidor se comparte solo con la app abierta y la pantalla prendida (la web no puede en segundo plano).
- El ETA es estimado en línea recta ajustada, no por calles.
- Mapa: tiles de OpenStreetMap (oscurecidos con un filtro CSS). CARTO ahora exige clave. Si el volumen crece, pasar a un proveedor con clave (MapTiler/Stadia) o a OpenFreeMap.
