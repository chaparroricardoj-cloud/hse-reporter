// Detecta automáticamente si corre en APK (Capacitor) o en navegador local
(function () {
    var isApk = window.location.protocol === 'capacitor:' ||
                typeof window.Capacitor !== 'undefined';

    // En APK → usa la IP del servidor real
    // En navegador local → usa URLs relativas (funciona con servidor.ps1)
    window.API_BASE = isApk ? 'http://186.123.181.61:5000' : '';
})();
