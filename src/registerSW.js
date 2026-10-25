// Install only a production build served over HTTPS or localhost. The portable
// file:// edition never depends on a service worker or a local server.
if (import.meta.env.PROD && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL(`${import.meta.env.BASE_URL}sw.js`, document.baseURI), { updateViaCache: 'none' }).catch(error => {
      console.info('El modo sin conexión no está disponible todavía.', error.message);
    });
  });
}
