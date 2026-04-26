'use strict';

// ── DATOS ──────────────────────────────────────────────────────────────────

const AREAS = {
  generacion:  { label: 'Generación',       icon: '⚙️' },
  combustible: { label: 'Combustible',       icon: '🛢️' },
  electrico:   { label: 'Eléctrico',         icon: '⚡' },
  taller:      { label: 'Taller',            icon: '🔧' },
  predio:      { label: 'Predio / Exterior', icon: '🏭' },
};

const SUGGESTIONS = {
  generacion: [
    'Trabajando sin protección auditiva en sala de máquinas',
    'Vibración anormal en grupo electrógeno',
    'Pérdida de aceite en motor',
    'Temperatura alta sin alarma activa',
    'Panel de control con puerta abierta',
    'Fuga de refrigerante',
    'Filtro de aire obstruido',
    'Operario solo en sala de máquinas (trabajo en solitario)',
    'Matafuego de sala vencido o descargado',
    'Correa de transmisión sin protección',
  ],
  combustible: [
    'Derrame / pérdida de gasoil en piso',
    'Tanque sin tapa o tapón',
    'Cañería con golpe o rajadura visible',
    'Bomba perdiendo combustible',
    'Matafuego de área descargado o vencido',
    'Transvasamiento sin puesta a tierra',
    'Área sin ventilación suficiente',
    'Kit de contención de derrames no disponible',
    'Zona de descarga sin señalización',
    'Operario sin EPP antiestático en zona de inflamables',
  ],
  electrico: [
    'Tablero eléctrico abierto sin señalizar',
    'Cable pelado o empalme improvisado con cinta',
    'Trabajo en tensión sin EPP dieléctrico',
    'Sin bloqueo LOTO en equipo en mantenimiento',
    'Disyuntor sin identificación o etiqueta',
    'Agua o humedad cerca de instalación eléctrica',
    'Puesta a tierra desconectada o deteriorada',
    'Iluminación insuficiente en sala de tableros',
    'Protección diferencial sin prueba periódica visible',
    'Cable tendido por el piso como paso de personas',
  ],
  taller: [
    'Amoladora angular sin protección / guarda',
    'Uso de herramienta en mal estado o improvisada',
    'Soldando sin máscara o protección ocular',
    'Cilindros de gas sin traba ni cadena de sujeción',
    'Piso con aceite, grasa o viruta resbaladiza',
    'Trabajo en altura sin arnés ni línea de vida',
    'Equipo sobre gato hidráulico sin calzas de seguridad',
    'Extintor fuera de su lugar o sin señalización',
    'Sin extinción de puntos calientes post-soldadura',
    'Almacenamiento incorrecto de productos químicos',
  ],
  predio: [
    'Portón de acceso abierto sin custodia',
    'Luminaria quemada en acceso o circulación nocturna',
    'Piso o vereda roto con riesgo de caída',
    'Acumulación de material inflamable cerca de instalaciones',
    'Señalética de seguridad borrosa o caída',
    'Residuo peligroso (aceite, trapos, baterías) mal depositado',
    'Escalera de acceso en mal estado',
    'Persona ajena a planta sin acompañante o EPP',
    'Desnivel sin señalización ni protección',
    'Falta de iluminación en zona de circulación nocturna',
  ],
};

// ── ESTADO DE LA APP ────────────────────────────────────────────────────────

const state = {
  report: {},
  reports: JSON.parse(localStorage.getItem('hse_reports') || '[]'),
};

function resetReport() {
  state.report = {
    tipo: null, area: null,
    descripcion: '', ubicacion: '',
    riesgo: null, fotoData: null,
    resueltoMomento: false,
  };
}

// ── NAVEGACIÓN ──────────────────────────────────────────────────────────────

const PROGRESS = { home: 0, type: 25, area: 50, description: 75, risk: 100, success: 100 };

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  window.scrollTo(0, 0);
  const fill = document.getElementById('progress-fill');
  if (fill) fill.style.width = PROGRESS[id] + '%';
}

// ── PANTALLA HOME ───────────────────────────────────────────────────────────

function renderHome() {
  const today = new Date().toDateString();
  const todayCount = state.reports.filter(r => new Date(r.timestamp).toDateString() === today).length;

  document.getElementById('stat-today').textContent = todayCount;
  document.getElementById('stat-total').textContent = state.reports.length;

  const container = document.getElementById('recent-list');
  const recent = state.reports.slice(-4).reverse();

  if (recent.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#7f8c8d;font-size:14px;padding:24px 0">Sin reportes registrados aún</p>';
    return;
  }

  container.innerHTML = recent.map(r => `
    <div class="recent-item">
      <div>
        <div class="desc">${r.descripcion.substring(0, 42)}${r.descripcion.length > 42 ? '…' : ''}</div>
        <div class="meta">${AREAS[r.area]?.label || r.area} · ${formatDate(r.timestamp)}</div>
      </div>
      <span class="badge ${r.riesgo}">${r.riesgo.toUpperCase()}</span>
    </div>
  `).join('');
}

function startReport() {
  resetReport();
  // Limpiar selecciones anteriores
  document.querySelectorAll('.type-btn, .area-btn, .suggestion-item, .risk-btn')
    .forEach(b => b.classList.remove('selected'));
  document.getElementById('custom-description').style.display = 'none';
  document.getElementById('desc-textarea').value = '';
  document.getElementById('location-input').value = '';
  document.getElementById('photo-preview').classList.remove('visible');
  document.getElementById('photo-btn-label').innerHTML = '📷&nbsp; Adjuntar foto';
  document.getElementById('photo-btn-label').classList.remove('has-photo');
  document.getElementById('btn-next-desc').disabled = true;
  document.getElementById('btn-submit').disabled = true;
  document.getElementById('toggle-resolved').checked = false;
  document.getElementById('emergency-banner').classList.remove('visible');
  document.getElementById('photo-required-msg').style.display = 'none';
  showScreen('type');
}

// ── PANTALLA TYPE ───────────────────────────────────────────────────────────

function selectType(tipo, btn) {
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.report.tipo = tipo;
  setTimeout(() => showScreen('area'), 220);
}

// ── PANTALLA AREA ───────────────────────────────────────────────────────────

function selectArea(area, btn) {
  document.querySelectorAll('.area-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.report.area = area;

  // Cargar sugerencias para esta área
  loadSuggestions(area);

  // Aviso LOTO para eléctrico
  const loto = document.getElementById('loto-warning');
  loto.style.display = area === 'electrico' ? 'flex' : 'none';

  setTimeout(() => showScreen('description'), 220);
}

// ── PANTALLA DESCRIPTION ────────────────────────────────────────────────────

function loadSuggestions(area) {
  const list = SUGGESTIONS[area] || [];
  const container = document.getElementById('suggestions-container');

  container.innerHTML = list.map((s, i) => `
    <button class="suggestion-item" onclick="selectSuggestion(this, '${s.replace(/'/g, "\\'")}')">
      <span class="sug-icon">💬</span>
      <span>${s}</span>
    </button>
  `).join('') + `
    <button class="suggestion-item" onclick="selectCustom()">
      <span class="sug-icon">✏️</span>
      <span>Escribir descripción propia…</span>
    </button>
  `;
}

function selectSuggestion(btn, text) {
  document.querySelectorAll('.suggestion-item').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.report.descripcion = text;
  document.getElementById('custom-description').style.display = 'none';
  checkDescriptionValid();
}

function selectCustom() {
  const btns = document.querySelectorAll('.suggestion-item');
  btns.forEach(b => b.classList.remove('selected'));
  btns[btns.length - 1].classList.add('selected');
  const custom = document.getElementById('custom-description');
  custom.style.display = 'block';
  const ta = document.getElementById('desc-textarea');
  ta.focus();
  state.report.descripcion = ta.value;
  checkDescriptionValid();
}

function onDescInput(el) {
  state.report.descripcion = el.value;
  document.getElementById('char-count').textContent = el.value.length + '/280';
  checkDescriptionValid();
}

function checkDescriptionValid() {
  const hasDesc = state.report.descripcion && state.report.descripcion.trim().length >= 5;
  const hasLoc  = (document.getElementById('location-input')?.value || '').trim().length >= 2;
  document.getElementById('btn-next-desc').disabled = !(hasDesc && hasLoc);
}

// ── FOTO ────────────────────────────────────────────────────────────────────

function handlePhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    state.report.fotoData = e.target.result;
    const preview = document.getElementById('photo-preview');
    preview.src = e.target.result;
    preview.classList.add('visible');
    const lbl = document.getElementById('photo-btn-label');
    lbl.innerHTML = '✅&nbsp; Foto adjuntada';
    lbl.classList.add('has-photo');
    checkRiskValid();
  };
  reader.readAsDataURL(file);
}

// ── PANTALLA RISK ───────────────────────────────────────────────────────────

function selectRisk(level) {
  document.querySelectorAll('.risk-btn').forEach(b => b.classList.remove('selected'));
  document.querySelector('.risk-btn.' + level).classList.add('selected');
  state.report.riesgo = level;

  const msg = document.getElementById('photo-required-msg');
  msg.style.display = level === 'alto' ? 'block' : 'none';

  const banner = document.getElementById('emergency-banner');
  level === 'alto' ? banner.classList.add('visible') : banner.classList.remove('visible');

  checkRiskValid();
}

function checkRiskValid() {
  const hasRisk  = !!state.report.riesgo;
  const photoOk  = state.report.riesgo !== 'alto' || !!state.report.fotoData;
  document.getElementById('btn-submit').disabled = !(hasRisk && photoOk);
}

// ── ENVIAR REPORTE ──────────────────────────────────────────────────────────

function submitReport() {
  const report = {
    ...state.report,
    id:               generateId(),
    timestamp:        new Date().toISOString(),
    operario:         'Operario Demo',
    resueltoMomento:  document.getElementById('toggle-resolved').checked,
    ubicacion:        document.getElementById('location-input').value.trim(),
    descripcion:      state.report.descripcion,
    estado:           'pendiente',
  };

  state.reports.push(report);
  localStorage.setItem('hse_reports', JSON.stringify(state.reports));

  renderSuccess(report);
  showScreen('success');

  // En producción: enviar al backend
  sendToBackend(report);
}

function renderSuccess(r) {
  document.getElementById('success-id').textContent = '#' + r.id;
  document.getElementById('sum-tipo').textContent      = r.tipo === 'acto' ? 'Acto Inseguro' : 'Condición Insegura';
  document.getElementById('sum-area').textContent      = AREAS[r.area]?.label || r.area;
  document.getElementById('sum-desc').textContent      = r.descripcion;
  document.getElementById('sum-ubicacion').textContent = r.ubicacion || '—';
  document.getElementById('sum-resuelto').textContent  = r.resueltoMomento ? '✅ Sí' : '❌ No';

  const riesgoEl = document.getElementById('sum-riesgo');
  riesgoEl.textContent  = r.riesgo.toUpperCase();
  riesgoEl.className    = 'value badge ' + r.riesgo;
}

function sendToBackend(report) {
  if (!navigator.onLine) return;
  fetch((window.API_BASE || '') + '/api/reportes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  }).catch(() => {
    console.warn('Sin conexión — reporte guardado localmente');
  });
}

function newReport() {
  renderHome();
  startReport();
}

// ── UTILS ───────────────────────────────────────────────────────────────────

function generateId() {
  return 'HSE-' + Date.now().toString(36).toUpperCase().slice(-6);
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── INIT ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  renderHome();

  window.addEventListener('online',  () => document.getElementById('offline-banner').classList.remove('visible'));
  window.addEventListener('offline', () => document.getElementById('offline-banner').classList.add('visible'));
  if (!navigator.onLine) document.getElementById('offline-banner').classList.add('visible');

  // Service Worker para offline
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
