/* Reparto · conexión con Firebase (un solo lugar para versiones y helpers). Módulo ES. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, deleteField } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, deleteField };
export const LOCAL = new URLSearchParams(location.search).get('l') || window.REPARTO_LOCAL || 'shivos';
export const app = initializeApp(window.FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);
/* Referencias dentro del local: ref() es el doc del local, ref('pedidos', id) un pedido, col('pedidos') la colección. */
export const ref = (...s) => doc(db, 'reparto', LOCAL, ...s);
export const col = n => collection(db, 'reparto', LOCAL, n);
/* Los mails se guardan como clave de mapa cambiando "." por "," (Firestore no admite puntos en claves de campo). */
export const keyOf = e => String(e || '').trim().toLowerCase().replace(/\./g, ',');
export const BASE = () => location.origin + location.pathname.replace(/[^/]*$/, '');
export const trackUrl = tok => BASE() + 'track.html?t=' + tok + (LOCAL !== (window.REPARTO_LOCAL || 'shivos') ? '&l=' + LOCAL : '');

getRedirectResult(auth).catch(() => { });
export function login() {
  const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, p).catch(e => { if (/popup-blocked|cancelled-popup|operation-not-supported/.test(e.code)) return signInWithRedirect(auth, p); });
}
export const onUser = cb => onAuthStateChanged(auth, cb);
export const logout = () => signOut(auth).then(() => location.reload());
