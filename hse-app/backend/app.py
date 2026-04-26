"""
HSE Reporter — Backend Flask con SQL Server 2016
Requisitos:
    pip install flask flask-cors python-dotenv pyodbc

Variables en backend/.env:
    DB_HOST      = IP o nombre del servidor
    DB_NAME      = hse_db
    DB_USER      = hse_app
    DB_PASSWORD  = contraseña del usuario de app (NO usar sa)
    SMTP_USER    = correo Office 365
    SMTP_PASSWORD= contraseña
    SUPERVISORES = email1@empresa.com,email2@empresa.com
"""

import os
import json
import smtplib
import logging
from contextlib          import contextmanager
from email.mime.multipart import MIMEMultipart
from email.mime.text      import MIMEText
from datetime             import datetime
from pathlib              import Path

import pyodbc
from flask      import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv     import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).parent.parent

app = Flask(__name__, static_folder=str(ROOT_DIR), static_url_path='')
CORS(app)

# ── CONFIGURACIÓN ─────────────────────────────────────────

DB_HOST     = os.getenv('DB_HOST', '')
DB_NAME     = os.getenv('DB_NAME', 'hse_db')
DB_USER     = os.getenv('DB_USER', '')
DB_PASSWORD = os.getenv('DB_PASSWORD', '')

SMTP_HOST     = 'smtp.office365.com'
SMTP_PORT     = 587
SMTP_USER     = os.getenv('SMTP_USER', '')
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD', '')
SUPERVISORES  = [s.strip() for s in os.getenv('SUPERVISORES', '').split(',') if s.strip()]

AREAS = {
    'generacion':  'Generación',
    'combustible': 'Combustible',
    'electrico':   'Eléctrico',
    'taller':      'Taller',
    'predio':      'Predio / Exterior',
}

ACCIONES_DEFAULT = {
    'alto':  ('Aislar el área y notificar a supervisión de inmediato.',
              'Reparar, documentar causa raíz y registrar en sistema.',
              'Revisar procedimientos y reforzar capacitación del área.'),
    'medio': ('Señalizar el riesgo y restringir el acceso.',
              'Programar corrección en las próximas 48 horas.',
              'Incluir en inspección periódica del área.'),
    'bajo':  ('Registrar y asignar responsable de seguimiento.',
              'Corregir en la próxima oportunidad disponible.',
              'Revisar en ronda de seguridad semanal.'),
}

# ── BASE DE DATOS ─────────────────────────────────────────

def _conn_str():
    return (
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={DB_HOST};"
        f"DATABASE={DB_NAME};"
        f"UID={DB_USER};"
        f"PWD={DB_PASSWORD};"
        f"TrustServerCertificate=yes;"
        f"Connection Timeout=10;"
    )

@contextmanager
def get_db():
    """Context manager que abre y cierra conexión automáticamente."""
    conn = pyodbc.connect(_conn_str())
    conn.autocommit = False
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def row_to_dict(cursor, row):
    """Convierte una fila pyodbc a diccionario."""
    cols = [col[0] for col in cursor.description]
    d = dict(zip(cols, row))
    # Serializar fechas a ISO string
    for k, v in d.items():
        if isinstance(v, datetime):
            d[k] = v.isoformat()
        elif isinstance(v, bool):
            d[k] = v
    return d

def test_connection():
    try:
        with get_db() as conn:
            conn.cursor().execute("SELECT 1")
        return True
    except Exception as e:
        log.error("Error de conexión a SQL Server: %s", e)
        return False

# ── EMAIL ─────────────────────────────────────────────────

def build_email_html(reporte: dict) -> str:
    tpl = ROOT_DIR / 'emails' / 'alerta_alto_riesgo.html'
    html = tpl.read_text(encoding='utf-8')

    riesgo     = reporte.get('riesgo', 'bajo')
    inm, cor, pre = ACCIONES_DEFAULT.get(riesgo, ACCIONES_DEFAULT['bajo'])
    acc = reporte.get('acciones') or {}
    if isinstance(acc, str):
        try: acc = json.loads(acc)
        except: acc = {}

    ts_raw = reporte.get('timestamp_reporte') or reporte.get('timestamp', '')
    try:
        ts = datetime.fromisoformat(str(ts_raw))
        fecha_hora = ts.strftime('%d/%m/%Y %H:%M')
    except Exception:
        fecha_hora = str(ts_raw)

    for k, v in {
        '{{ID}}':               reporte.get('id', ''),
        '{{TIPO}}':             'Acto Inseguro' if reporte.get('tipo') == 'acto' else 'Condición Insegura',
        '{{AREA}}':             AREAS.get(reporte.get('area', ''), reporte.get('area', '')),
        '{{DESCRIPCION}}':      reporte.get('descripcion', ''),
        '{{UBICACION}}':        reporte.get('ubicacion') or '—',
        '{{OPERARIO}}':         reporte.get('operario_nombre') or reporte.get('operario') or '—',
        '{{FECHA_HORA}}':       fecha_hora,
        '{{RESUELTO}}':         'Sí — resuelto en el momento' if reporte.get('resueltoMomento') else 'No — pendiente',
        '{{ACCION_INMEDIATA}}': acc.get('inmediata', inm),
        '{{ACCION_CORRECTIVA}}':acc.get('correctiva', cor),
        '{{ACCION_PREVENTIVA}}':acc.get('preventiva', pre),
    }.items():
        html = html.replace(k, str(v))
    return html

def send_email(to_list, subject, html):
    if not SMTP_USER or not SMTP_PASSWORD:
        log.warning('SMTP no configurado — email simulado a: %s', to_list)
        return True
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From']    = SMTP_USER
    msg['To']      = ', '.join(to_list)
    msg.attach(MIMEText(html, 'html', 'utf-8'))
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as srv:
            srv.ehlo(); srv.starttls()
            srv.login(SMTP_USER, SMTP_PASSWORD)
            srv.sendmail(SMTP_USER, to_list, msg.as_string())
        log.info('Email enviado a %s', to_list)
        return True
    except Exception as e:
        log.error('Error email: %s', e)
        return False

# ── RUTAS ESTÁTICAS ───────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory(ROOT_DIR, 'index.html')

@app.route('/admin')
def admin():
    return send_from_directory(ROOT_DIR, 'admin.html')

# ── API ───────────────────────────────────────────────────

@app.route('/api/reportes', methods=['GET'])
def get_reportes():
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT r.id, r.tipo, r.area, r.descripcion, r.ubicacion,
                       r.riesgo, r.resuelto_momento, r.operario_nombre,
                       r.estado, r.accion_inmediata, r.accion_correctiva,
                       r.accion_preventiva, r.timestamp_reporte,
                       r.cerrado_at, r.updated_at
                FROM dbo.reportes r
                ORDER BY
                    CASE r.riesgo WHEN 'alto' THEN 1 WHEN 'medio' THEN 2 ELSE 3 END,
                    r.timestamp_reporte DESC
            """)
            rows = [row_to_dict(cur, row) for row in cur.fetchall()]

        # Normalizar nombres de campo para compatibilidad con el frontend
        for r in rows:
            r['timestamp']       = r.pop('timestamp_reporte', None)
            r['resueltoMomento'] = bool(r.pop('resuelto_momento', False))
            r['acciones'] = {
                'inmediata':  r.pop('accion_inmediata', ''),
                'correctiva': r.pop('accion_correctiva', ''),
                'preventiva': r.pop('accion_preventiva', ''),
            }

        return jsonify({'reportes': rows, 'total': len(rows)})
    except Exception as e:
        log.error('GET /api/reportes: %s', e)
        return jsonify({'error': str(e)}), 500


@app.route('/api/reportes', methods=['POST'])
def post_reporte():
    data = request.get_json(silent=True)
    if not data or not data.get('id'):
        return jsonify({'error': 'Payload inválido'}), 400

    rid    = data.get('id')
    riesgo = data.get('riesgo', 'bajo')
    acc    = data.get('acciones') or {}

    try:
        with get_db() as conn:
            cur = conn.cursor()

            # Evitar duplicados
            cur.execute("SELECT id FROM dbo.reportes WHERE id = ?", rid)
            if cur.fetchone():
                return jsonify({'status': 'already_exists', 'id': rid}), 200

            ts_str = data.get('timestamp', datetime.now().isoformat())
            try:
                ts = datetime.fromisoformat(ts_str)
            except Exception:
                ts = datetime.now()

            cur.execute("""
                INSERT INTO dbo.reportes (
                    id, tipo, area, descripcion, ubicacion, riesgo,
                    foto_base64, resuelto_momento, operario_nombre,
                    accion_inmediata, accion_correctiva, accion_preventiva,
                    timestamp_reporte, estado
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')
            """,
                rid,
                data.get('tipo', ''),
                data.get('area', ''),
                data.get('descripcion', ''),
                data.get('ubicacion', ''),
                riesgo,
                data.get('fotoData', ''),
                1 if data.get('resueltoMomento') else 0,
                data.get('operario_nombre') or data.get('operario', ''),
                acc.get('inmediata', ACCIONES_DEFAULT[riesgo][0]),
                acc.get('correctiva', ACCIONES_DEFAULT[riesgo][1]),
                acc.get('preventiva', ACCIONES_DEFAULT[riesgo][2]),
                ts,
            )

            # Log notificación
            if riesgo == 'alto':
                for dest in SUPERVISORES:
                    cur.execute("""
                        INSERT INTO dbo.notificaciones_log
                            (reporte_id, destinatario, tipo)
                        VALUES (?, ?, 'alerta_alto')
                    """, rid, dest)

        log.info('Reporte guardado: %s | %s | %s', rid, data.get('area'), riesgo)

        # Email ALTO
        if riesgo == 'alto' and SUPERVISORES:
            html    = build_email_html(data)
            subject = f"🚨 ALERTA RIESGO ALTO — {AREAS.get(data.get('area',''),'')} [{rid}]"
            ok      = send_email(SUPERVISORES, subject, html)
            if ok:
                with get_db() as conn:
                    conn.cursor().execute("""
                        UPDATE dbo.notificaciones_log
                        SET enviado = 1, enviado_at = GETDATE()
                        WHERE reporte_id = ? AND tipo = 'alerta_alto'
                    """, rid)

        return jsonify({'status': 'ok', 'id': rid}), 201

    except Exception as e:
        log.error('POST /api/reportes: %s', e)
        return jsonify({'error': str(e)}), 500


@app.route('/api/reportes/<report_id>', methods=['PUT'])
def put_reporte(report_id):
    updates = request.get_json(silent=True) or {}
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id FROM dbo.reportes WHERE id = ?", report_id)
            if not cur.fetchone():
                return jsonify({'error': 'No encontrado'}), 404

            nuevo_estado = updates.get('estado')
            acc          = updates.get('acciones') or {}

            sql_parts = ["updated_at = GETDATE()"]
            params    = []

            if nuevo_estado:
                sql_parts.append("estado = ?")
                params.append(nuevo_estado)
                if nuevo_estado == 'cerrado':
                    sql_parts.append("cerrado_at = GETDATE()")

            if acc.get('inmediata'):
                sql_parts.append("accion_inmediata = ?")
                params.append(acc['inmediata'])
            if acc.get('correctiva'):
                sql_parts.append("accion_correctiva = ?")
                params.append(acc['correctiva'])
            if acc.get('preventiva'):
                sql_parts.append("accion_preventiva = ?")
                params.append(acc['preventiva'])

            params.append(report_id)
            cur.execute(
                f"UPDATE dbo.reportes SET {', '.join(sql_parts)} WHERE id = ?",
                *params
            )

        log.info('Reporte actualizado: %s → %s', report_id, nuevo_estado or 'acciones')
        return jsonify({'status': 'ok', 'id': report_id})
    except Exception as e:
        log.error('PUT /api/reportes/%s: %s', report_id, e)
        return jsonify({'error': str(e)}), 500


@app.route('/api/reportes/<report_id>', methods=['GET'])
def get_reporte(report_id):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM dbo.reportes WHERE id = ?", report_id)
            row = cur.fetchone()
            if not row:
                return jsonify({'error': 'No encontrado'}), 404
            return jsonify(row_to_dict(cur, row))
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/health')
def health():
    db_ok = test_connection()
    return jsonify({
        'status':    'ok' if db_ok else 'db_error',
        'db':        'connected' if db_ok else 'error',
        'smtp_cfg':  bool(SMTP_USER),
        'timestamp': datetime.now().isoformat(),
    }), 200 if db_ok else 503


# ── INICIO ────────────────────────────────────────────────

if __name__ == '__main__':
    log.info('=== HSE Reporter iniciando ===')
    if not DB_HOST:
        log.warning('DB_HOST no configurado en .env — modo sin base de datos')
    else:
        ok = test_connection()
        log.info('Conexión SQL Server: %s', 'OK' if ok else 'ERROR — verificar .env')

    log.info('App:   http://localhost:5000')
    log.info('Admin: http://localhost:5000/admin')
    app.run(host='0.0.0.0', port=5000, debug=False)
