'use strict';

// ── DATOS ──────────────────────────────────────────────────────────────────

const AREAS = {
  generacion:  '⚙️ Generación',
  combustible: '🛢️ Combustible',
  electrico:   '⚡ Eléctrico',
  taller:      '🔧 Taller',
  predio:      '🏭 Predio',
};

const TIPO_LABEL = { acto: 'Acto Inseguro', condicion: 'Condición Insegura' };

const ACCIONES_DEFAULT = {
  alto: {
    inmediata:  'Aislar el área y notificar a supervisión de inmediato.',
    correctiva: 'Reparar, documentar causa raíz y registrar en sistema.',
    preventiva: 'Revisar procedimientos y reforzar capacitación del área.',
  },
  medio: {
    inmediata:  'Señalizar el riesgo y restringir el acceso al área.',
    correctiva: 'Programar corrección en las próximas 48 horas.',
    preventiva: 'Incluir en inspección periódica del área.',
  },
  bajo: {
    inmediata:  'Registrar y asignar responsable de seguimiento.',
    correctiva: 'Corregir en la próxima oportunidad disponible.',
    preventiva: 'Revisar en ronda de seguridad semanal.',
  },
};

// ── ESTADO ────────────────────────────────────────────────────────────────

let allReports     = [];
let filtered       = [];
let currentReport  = null;
let activeFilters  = { area: '', riesgo: '', estado: '', q: '' };

// ── CARGA ─────────────────────────────────────────────────────────────────

async function loadReports() {
  try {
    const res  = await fetch((window.API_BASE || '') + '/api/reportes');
    const data = await res.json();
    allReports = Array.isArray(data.reportes) ? data.reportes : [];
  } catch {
    allReports = JSON.parse(localStorage.getItem('hse_reports') || '[]');
  }
  applyFilters();
  updateStats();
  renderTable();
  renderCharts();
}

// ── FILTROS ───────────────────────────────────────────────────────────────

function applyFilters() {
  const { area, riesgo, estado, q } = activeFilters;
  filtered = allReports.filter(r => {
    if (area   && r.area   !== area)   return false;
    if (riesgo && r.riesgo !== riesgo) return false;
    if (estado && r.estado !== estado) return false;
    if (q) {
      const hay = (r.descripcion + ' ' + r.ubicacion + ' ' + r.id + ' ' + r.operario_nombre).toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });
  renderTable();
}

function onFilter(key, val) {
  activeFilters[key] = val;
  applyFilters();
}

function filterByRisk(level) {
  activeFilters.riesgo = activeFilters.riesgo === level ? '' : level;
  document.getElementById('fil-riesgo').value = activeFilters.riesgo;
  applyFilters();
}

// ── STATS ─────────────────────────────────────────────────────────────────

function updateStats() {
  const count = (fn) => allReports.filter(fn).length;
  document.getElementById('s-total').textContent   = allReports.length;
  document.getElementById('s-alto').textContent    = count(r => r.riesgo === 'alto');
  document.getElementById('s-medio').textContent   = count(r => r.riesgo === 'medio');
  document.getElementById('s-bajo').textContent    = count(r => r.riesgo === 'bajo');
  document.getElementById('s-pend').textContent    = count(r => r.estado === 'pendiente' || !r.estado);
}

// ── TABLA ─────────────────────────────────────────────────────────────────

function renderTable() {
  const tbody = document.getElementById('report-tbody');

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="8">
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div>No hay reportes que coincidan con los filtros</div>
        </div>
      </td></tr>`;
    return;
  }

  const sorted = [...filtered].sort((a, b) => {
    const rOrder = { alto: 0, medio: 1, bajo: 2 };
    if (rOrder[a.riesgo] !== rOrder[b.riesgo]) return rOrder[a.riesgo] - rOrder[b.riesgo];
    return new Date(b.timestamp) - new Date(a.timestamp);
  });

  tbody.innerHTML = sorted.map(r => {
    const estado = r.estado || 'pendiente';
    return `
    <tr class="${r.riesgo}-row" onclick="openModal('${r.id}')">
      <td class="td-id">${r.id}</td>
      <td>${TIPO_LABEL[r.tipo] || r.tipo}</td>
      <td class="td-area">${AREAS[r.area] || r.area}</td>
      <td class="td-desc">${escHtml(r.descripcion)}</td>
      <td>${ubicStr(r.ubicacion)}</td>
      <td><span class="badge ${r.riesgo}">${r.riesgo.toUpperCase()}</span></td>
      <td><span class="badge ${estado}">${estadoLabel(estado)}</span></td>
      <td class="td-date">${formatDate(r.timestamp)}</td>
    </tr>`;
  }).join('');
}

function estadoLabel(e) {
  return { pendiente: 'Pendiente', en_curso: 'En curso', cerrado: 'Cerrado' }[e] || e;
}

function ubicStr(u) {
  return u ? `<span style="color:#374151">${escHtml(u)}</span>` : '<span style="color:#9ca3af">—</span>';
}

// ── MODAL ─────────────────────────────────────────────────────────────────

function openModal(id) {
  currentReport = allReports.find(r => r.id === id);
  if (!currentReport) return;

  const r       = currentReport;
  const estado  = r.estado || 'pendiente';
  const riesgo  = r.riesgo || 'bajo';
  const acc     = r.acciones || ACCIONES_DEFAULT[riesgo] || ACCIONES_DEFAULT.bajo;

  document.getElementById('m-id').textContent      = r.id;
  document.getElementById('m-tipo').textContent    = TIPO_LABEL[r.tipo] || r.tipo;
  document.getElementById('m-area').textContent    = AREAS[r.area] || r.area;
  document.getElementById('m-riesgo').className    = 'badge ' + riesgo;
  document.getElementById('m-riesgo').textContent  = riesgo.toUpperCase();
  document.getElementById('m-operario').textContent = r.operario_nombre || r.operario || '—';
  document.getElementById('m-fecha').textContent   = formatDate(r.timestamp);
  document.getElementById('m-ubicacion').textContent = r.ubicacion || '—';
  document.getElementById('m-resuelto').textContent = r.resueltoMomento ? '✅ Sí' : '❌ No';
  document.getElementById('m-desc').textContent    = r.descripcion;
  document.getElementById('m-estado').value        = estado;

  document.getElementById('m-accion-inm').value  = acc.inmediata  || '';
  document.getElementById('m-accion-cor').value  = acc.correctiva || '';
  document.getElementById('m-accion-pre').value  = acc.preventiva || '';

  // Foto
  const photoWrap = document.getElementById('m-photo-wrap');
  const photoImg  = document.getElementById('m-photo');
  if (r.fotoData) {
    photoImg.src = r.fotoData;
    photoWrap.style.display = 'block';
  } else {
    photoWrap.style.display = 'none';
  }

  // Botón cerrar
  document.getElementById('btn-close-report').style.display =
    estado === 'cerrado' ? 'none' : 'inline-block';

  document.getElementById('modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  currentReport = null;
}

// ── GUARDAR ───────────────────────────────────────────────────────────────

async function saveModal() {
  if (!currentReport) return;

  const updates = {
    estado: document.getElementById('m-estado').value,
    acciones: {
      inmediata:  document.getElementById('m-accion-inm').value,
      correctiva: document.getElementById('m-accion-cor').value,
      preventiva: document.getElementById('m-accion-pre').value,
    },
  };

  await updateReport(currentReport.id, updates);
  closeModal();
}

async function closeReport() {
  if (!currentReport) return;
  await updateReport(currentReport.id, { estado: 'cerrado', cerrado_at: new Date().toISOString() });
  closeModal();
}

async function updateReport(id, updates) {
  // Actualizar en memoria
  const idx = allReports.findIndex(r => r.id === id);
  if (idx >= 0) Object.assign(allReports[idx], updates);

  // Intentar guardar en backend
  try {
    await fetch((window.API_BASE || '') + `/api/reportes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  } catch {
    localStorage.setItem('hse_reports', JSON.stringify(allReports));
  }

  applyFilters();
  updateStats();
  renderTable();
  renderCharts();
  toast('Guardado correctamente', 'ok');
}

// ── EXPORT CSV ────────────────────────────────────────────────────────────

function exportCSV() {
  const rows = [
    ['ID', 'Tipo', 'Área', 'Descripción', 'Ubicación', 'Riesgo', 'Estado', 'Operario', 'Fecha', 'Resuelto en momento'],
    ...filtered.map(r => [
      r.id,
      TIPO_LABEL[r.tipo] || r.tipo,
      AREAS[r.area] || r.area,
      r.descripcion,
      r.ubicacion || '',
      r.riesgo,
      r.estado || 'pendiente',
      r.operario_nombre || r.operario || '',
      formatDate(r.timestamp),
      r.resueltoMomento ? 'Sí' : 'No',
    ]),
  ];

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM para Excel
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `HSE_Reportes_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV descargado', 'ok');
}

// ── ESTADÍSTICAS ──────────────────────────────────────────────────────────

function renderCharts() {
  renderBarChart('chart-areas',  buildAreaData());
  renderBarChart('chart-riesgo', buildRiesgoData());
  renderBarChart('chart-tipos',  buildTipoData());
  renderBarChart('chart-estado', buildEstadoData());
}

function buildAreaData() {
  const data = Object.entries(AREAS).map(([k, v]) => ({
    label: v.replace(/^.+?\s/, ''), // remove emoji prefix
    value: allReports.filter(r => r.area === k).length,
    cls:   'accent',
  }));
  return data;
}

function buildRiesgoData() {
  return [
    { label: '🔴 Alto',  value: allReports.filter(r => r.riesgo === 'alto').length,  cls: 'alto'  },
    { label: '🟡 Medio', value: allReports.filter(r => r.riesgo === 'medio').length, cls: 'medio' },
    { label: '🟢 Bajo',  value: allReports.filter(r => r.riesgo === 'bajo').length,  cls: 'bajo'  },
  ];
}

function buildTipoData() {
  return [
    { label: 'Acto inseguro',      value: allReports.filter(r => r.tipo === 'acto').length,      cls: 'accent' },
    { label: 'Condición insegura', value: allReports.filter(r => r.tipo === 'condicion').length, cls: 'medio'  },
  ];
}

function buildEstadoData() {
  return [
    { label: 'Pendiente', value: allReports.filter(r => !r.estado || r.estado === 'pendiente').length, cls: 'alto'   },
    { label: 'En curso',  value: allReports.filter(r => r.estado === 'en_curso').length,               cls: 'medio'  },
    { label: 'Cerrado',   value: allReports.filter(r => r.estado === 'cerrado').length,                cls: 'bajo'   },
  ];
}

function renderBarChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const max = Math.max(...data.map(d => d.value), 1);
  container.innerHTML = data.map(d => `
    <div class="bar-row">
      <span class="bar-label">${d.label}</span>
      <div class="bar-track">
        <div class="bar-fill ${d.cls}" style="width:${(d.value/max)*100}%"></div>
      </div>
      <span class="bar-num">${d.value}</span>
    </div>
  `).join('');
}

// ── NAVEGACIÓN ────────────────────────────────────────────────────────────

function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.getElementById('sec-' + id).classList.add('active');
  document.getElementById('nav-' + id).classList.add('active');
  if (id === 'stats') renderCharts();
}

// ── UTILS ─────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function toast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = (type === 'ok' ? '✅ ' : '❌ ') + msg;
  t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── INIT ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadReports();

  // Cerrar modal con Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // Cerrar modal haciendo click fuera
  document.getElementById('modal').addEventListener('click', e => {
    if (e.target === document.getElementById('modal')) closeModal();
  });

  // Auto-refresh cada 60 segundos
  setInterval(loadReports, 60_000);
});
