// Detecta si corre en APK (file://) o en navegador local (http://localhost)
(function () {
    var proto = window.location.protocol;
    var isApk = proto === 'file:' ||
                proto === 'capacitor:' ||
                typeof window.Capacitor !== 'undefined';

    // En APK → usa la IP del servidor real
    // En navegador local → usa URLs relativas (funciona con servidor.ps1)
    window.API_BASE = isApk ? 'http://186.123.181.61:5000' : '';
})();
