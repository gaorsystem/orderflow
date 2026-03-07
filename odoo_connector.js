'use strict';

/**
 * ============================================================
 * ODOO XML-RPC CONNECTOR — Módulo Robusto
 * ============================================================
 * Características:
 *   - Pool de conexiones por compañía (reutiliza sesiones autenticadas)
 *   - Heartbeat activo cada N segundos para mantener la sesión viva
 *   - Retry con backoff exponencial + jitter
 *   - Filtro automático por compañía (allowed_company_ids)
 *   - Queue de requests con concurrencia controlada
 *   - Serialización/deserialización XML-RPC completa
 *   - Sin dependencias externas (solo Node.js built-in)
 * ============================================================
 */

import http from 'http';
import https from 'https';
import { EventEmitter } from 'events';

// ─────────────────────────────────────────────
// XML-RPC SERIALIZER
// ─────────────────────────────────────────────
function serialize(value) {
  if (value === null || value === undefined) {
    return '<value><nil/></value>';
  }
  if (typeof value === 'boolean') {
    return `<value><boolean>${value ? 1 : 0}</boolean></value>`;
  }
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? `<value><int>${value}</int></value>`
      : `<value><double>${value}</double></value>`;
  }
  if (typeof value === 'string') {
    const esc = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
    return `<value><string>${esc}</string></value>`;
  }
  if (Array.isArray(value)) {
    return `<value><array><data>${value.map(serialize).join('')}</data></array></value>`;
  }
  if (value instanceof Date) {
    return `<value><dateTime.iso8601>${value.toISOString().replace(/[-:]/g, '').split('.')[0]}</dateTime.iso8601></value>`;
  }
  if (typeof value === 'object') {
    const members = Object.entries(value)
      .map(([k, v]) => `<member><name>${k}</name>${serialize(v)}</member>`)
      .join('');
    return `<value><struct>${members}</struct></value>`;
  }
  return `<value><string>${String(value)}</string></value>`;
}

// ─────────────────────────────────────────────
// XML-RPC DESERIALIZER
// ─────────────────────────────────────────────
function deserialize(xml) {
  // Detectar fault
  if (xml.includes('<fault>')) {
    const codeMatch  = xml.match(/<name>faultCode<\/name>\s*<value>(?:<int>|<i4>)(\d+)/);
    const strMatch   = xml.match(/<name>faultString<\/name>\s*<value><string>([\s\S]*?)<\/string>/);
    const code = codeMatch ? parseInt(codeMatch[1]) : 0;
    const msg  = strMatch  ? strMatch[1] : 'Unknown Odoo fault';
    const err  = new Error(`Odoo Fault [${code}]: ${msg.trim()}`);
    err.faultCode = code;
    throw err;
  }

  // Extraer valor del primer param
  const paramMatch = xml.match(/<params>\s*<param>\s*([\s\S]*?)\s*<\/param>\s*<\/params>/);
  if (!paramMatch) throw new Error('Invalid XML-RPC response: no params');

  return parseValue(paramMatch[1].trim());
}

function parseValue(xml) {
  xml = xml.trim();

  // <value> wrapper
  const valMatch = xml.match(/^<value>([\s\S]*)<\/value>$/);
  if (valMatch) return parseValue(valMatch[1].trim());

  // Tipos primitivos
  const intMatch = xml.match(/^<(?:int|i4|i8)>([\s\S]*?)<\/(?:int|i4|i8)>$/);
  if (intMatch) return parseInt(intMatch[1]);

  const dblMatch = xml.match(/^<double>([\s\S]*?)<\/double>$/);
  if (dblMatch) return parseFloat(dblMatch[1]);

  const boolMatch = xml.match(/^<boolean>([\s\S]*?)<\/boolean>$/);
  if (boolMatch) return boolMatch[1].trim() === '1';

  const strMatch = xml.match(/^<string>([\s\S]*?)<\/string>$/);
  if (strMatch) return strMatch[1]
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  if (xml === '<nil/>' || xml === '<nil></nil>') return null;
  if (xml === '<string/>' || xml === '<string></string>') return '';

  const dtMatch = xml.match(/^<dateTime\.iso8601>([\s\S]*?)<\/dateTime\.iso8601>$/);
  if (dtMatch) return new Date(dtMatch[1]);

  // Array
  if (xml.startsWith('<array>')) {
    const dataMatch = xml.match(/<data>([\s\S]*)<\/data>/);
    if (!dataMatch) return [];
    return parseDataSection(dataMatch[1]);
  }

  // Struct
  if (xml.startsWith('<struct>')) {
    const obj = {};
    const memberRe = /<member>([\s\S]*?)<\/member>/g;
    let m;
    while ((m = memberRe.exec(xml)) !== null) {
      const nameMatch = m[1].match(/<name>([\s\S]*?)<\/name>/);
      const valMatch2 = m[1].match(/<value>([\s\S]*?)<\/value>/);
      if (nameMatch && valMatch2) {
        obj[nameMatch[1]] = parseValue(valMatch2[1].trim());
      }
    }
    return obj;
  }

  // Texto plano (string sin tags)
  if (!xml.startsWith('<')) return xml;

  return null;
}

function parseDataSection(data) {
  const items = [];
  const valueRe = /<value>([\s\S]*?)<\/value>/g;
  let m;
  while ((m = valueRe.exec(data)) !== null) {
    items.push(parseValue(m[1].trim()));
  }
  return items;
}

// ─────────────────────────────────────────────
// HTTP RAW REQUEST (sin dependencias)
// ─────────────────────────────────────────────
function httpRequest(urlStr, body, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const url      = new URL(urlStr);
    const lib      = url.protocol === 'https:' ? https : http;
    const bodyBuf  = Buffer.from(body, 'utf8');

    const options = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method:   'POST',
      headers: {
        'Content-Type':   'text/xml; charset=utf-8',
        'Content-Length': bodyBuf.length,
        'Connection':     'keep-alive',
        'Accept-Encoding':'identity',
      },
      timeout: timeoutMs,
    };

    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeoutMs}ms`));
    });

    req.on('error', reject);
    req.write(bodyBuf);
    req.end();
  });
}

// ─────────────────────────────────────────────
// RETRY CON BACKOFF EXPONENCIAL + JITTER
// ─────────────────────────────────────────────
async function withRetry(fn, {
  maxRetries  = 4,
  baseDelayMs = 500,
  maxDelayMs  = 10000,
  shouldRetry = (err) => !err.faultCode, // No reintentar faults de Odoo (errores de lógica)
  onRetry     = null,
} = {}) {
  let lastErr;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      if (attempt === maxRetries || !shouldRetry(err)) throw err;

      // Backoff exponencial con jitter: delay * (1 + random*0.3)
      const base  = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const delay = Math.round(base * (1 + Math.random() * 0.3));

      if (onRetry) onRetry(attempt, delay, err);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastErr;
}

// ─────────────────────────────────────────────
// REQUEST QUEUE — Controla concurrencia
// ─────────────────────────────────────────────
class RequestQueue {
  constructor(concurrency = 3) {
    this.concurrency = concurrency;
    this.running     = 0;
    this.queue       = [];
  }

  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._run();
    });
  }

  async _run() {
    if (this.running >= this.concurrency || !this.queue.length) return;

    this.running++;
    const { fn, resolve, reject } = this.queue.shift();

    try {
      resolve(await fn());
    } catch (err) {
      reject(err);
    } finally {
      this.running--;
      this._run();
    }
  }

  get pending() { return this.queue.length; }
  get active()  { return this.running; }
}

// ─────────────────────────────────────────────
// CONNECTION POOL — Una entrada por compañía
// ─────────────────────────────────────────────
class OdooConnectionPool {
  constructor() {
    this._pool = new Map(); // key: `${url}::${db}::${companyId}`
  }

  _key(cfg) {
    return `${cfg.url}::${cfg.db}::${cfg.companyId}`;
  }

  get(cfg) {
    return this._pool.get(this._key(cfg)) || null;
  }

  set(cfg, conn) {
    this._pool.set(this._key(cfg), conn);
  }

  invalidate(cfg) {
    const key = this._key(cfg);
    const conn = this._pool.get(key);
    if (conn) {
      conn._stopHeartbeat();
      this._pool.delete(key);
    }
  }

  invalidateAll() {
    for (const conn of this._pool.values()) conn._stopHeartbeat();
    this._pool.clear();
  }

  get size() { return this._pool.size; }

  stats() {
    const result = {};
    for (const [key, conn] of this._pool.entries()) {
      result[key] = conn.stats();
    }
    return result;
  }
}

// Singleton del pool
const pool = new OdooConnectionPool();

// ─────────────────────────────────────────────
// ODOO CONNECTION — Una instancia autenticada
// ─────────────────────────────────────────────
class OdooConnection extends EventEmitter {
  /**
   * @param {object} cfg
   * @param {string}  cfg.url         — https://miodoo.com
   * @param {string}  cfg.db          — nombre de la BD en Odoo
   * @param {string}  cfg.username    — usuario (email)
   * @param {string}  cfg.password    — contraseña
   * @param {number}  cfg.companyId   — ID de la compañía (multicompañía)
   * @param {number}  [cfg.heartbeatMs=60000]   — intervalo heartbeat
   * @param {number}  [cfg.timeoutMs=30000]     — timeout por request
   * @param {number}  [cfg.concurrency=3]       — requests paralelos
   * @param {boolean} [cfg.debug=false]         — logs detallados
   */
  constructor(cfg) {
    super();

    if (!cfg.url || !cfg.db || !cfg.username || !cfg.password || !cfg.companyId) {
      throw new Error('OdooConnection: url, db, username, password y companyId son requeridos');
    }

    this.cfg = {
      heartbeatMs : 60_000,
      timeoutMs   : 30_000,
      concurrency : 3,
      debug       : false,
      ...cfg,
      url: cfg.url.replace(/\/$/, ''), // sin trailing slash
    };

    this.uid           = null;
    this.authenticated = false;
    this._heartbeatTimer = null;
    this._authPromise    = null;
    this._queue          = new RequestQueue(this.cfg.concurrency);

    // Estadísticas
    this._stats = {
      totalCalls    : 0,
      successCalls  : 0,
      errorCalls    : 0,
      retryCalls    : 0,
      authCount     : 0,
      lastCallAt    : null,
      connectedAt   : null,
    };
  }

  // ── LOG ──────────────────────────────────────
  _log(level, ...args) {
    if (level === 'debug' && !this.cfg.debug) return;
    const prefix = `[OdooXRPC][cía:${this.cfg.companyId}]`;
    if (level === 'error') console.error(prefix, ...args);
    else if (level === 'warn') console.warn(prefix, ...args);
    else if (this.cfg.debug) console.log(prefix, ...args);
  }

  // ── AUTENTICACIÓN ────────────────────────────
  async authenticate() {
    // Evitar autenticaciones paralelas: reusar la promesa en curso
    if (this._authPromise) return this._authPromise;

    this._authPromise = this._doAuthenticate();
    try {
      await this._authPromise;
    } finally {
      this._authPromise = null;
    }
  }

  async _doAuthenticate() {
    this._log('debug', 'Autenticando...');

    const body = `<?xml version="1.0"?>
<methodCall>
  <methodName>authenticate</methodName>
  <params>
    <param>${serialize(this.cfg.db)}</param>
    <param>${serialize(this.cfg.username)}</param>
    <param>${serialize(this.cfg.password)}</param>
    <param>${serialize({})}</param>
  </params>
</methodCall>`;

    const xml = await withRetry(
      () => httpRequest(`${this.cfg.url}/xmlrpc/2/common`, body, this.cfg.timeoutMs),
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        onRetry: (attempt, delay) =>
          this._log('warn', `Auth reintento ${attempt}, esperando ${delay}ms`),
      }
    );

    const uid = deserialize(xml);
    if (!uid || uid === false || uid === 0) {
      throw new Error('Autenticación fallida: credenciales incorrectas o usuario sin acceso');
    }

    this.uid           = uid;
    this.authenticated = true;
    this._stats.authCount++;
    this._stats.connectedAt = new Date();

    this._log('debug', `Autenticado con uid=${uid}`);
    this.emit('authenticated', uid);

    // Iniciar heartbeat
    this._startHeartbeat();
  }

  // ── HEARTBEAT ────────────────────────────────
  _startHeartbeat() {
    this._stopHeartbeat();

    this._heartbeatTimer = setInterval(async () => {
      try {
        await this._ping();
        this._log('debug', 'Heartbeat OK');
        this.emit('heartbeat', { ok: true });
      } catch (err) {
        this._log('warn', 'Heartbeat falló, re-autenticando:', err.message);
        this.authenticated = false;
        this.uid = null;
        this.emit('heartbeat', { ok: false, error: err.message });
        try {
          await this.authenticate();
        } catch (authErr) {
          this._log('error', 'Re-autenticación fallida:', authErr.message);
          this.emit('error', authErr);
        }
      }
    }, this.cfg.heartbeatMs);

    // No bloquear el proceso si solo queda este timer
    if (this._heartbeatTimer.unref) {
      this._heartbeatTimer.unref();
    }
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  // Ping liviano: leer versión de Odoo
  async _ping() {
    const body = `<?xml version="1.0"?>
<methodCall>
  <methodName>version</methodName>
  <params></params>
</methodCall>`;
    const xml = await httpRequest(
      `${this.cfg.url}/xmlrpc/2/common`, body, 10_000
    );
    return deserialize(xml);
  }

  // ── EXECUTE_KW — Llamada principal ───────────
  /**
   * Ejecutar cualquier método de Odoo
   * @param {string}   model   — ej: 'product.product'
   * @param {string}   method  — ej: 'search_read'
   * @param {Array}    args    — argumentos posicionales
   * @param {object}   kwargs  — argumentos nombrados
   */
  async execute(model, method, args = [], kwargs = {}) {
    // Asegurar autenticación
    if (!this.authenticated) await this.authenticate();

    // Inyectar contexto de compañía automáticamente
    kwargs = {
      ...kwargs,
      context: {
        lang: 'es_PE',
        tz: 'America/Lima',
        ...(kwargs.context || {}),
        allowed_company_ids: [this.cfg.companyId],
        company_id: this.cfg.companyId,
      },
    };

    // Encolar para respetar concurrencia
    return this._queue.add(() => this._doExecute(model, method, args, kwargs));
  }

  async _doExecute(model, method, args, kwargs) {
    this._stats.totalCalls++;
    this._stats.lastCallAt = new Date();

    const body = `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param>${serialize(this.cfg.db)}</param>
    <param>${serialize(this.uid)}</param>
    <param>${serialize(this.cfg.password)}</param>
    <param>${serialize(model)}</param>
    <param>${serialize(method)}</param>
    <param>${serialize(args)}</param>
    <param>${serialize(kwargs)}</param>
  </params>
</methodCall>`;

    try {
      const xml = await withRetry(
        () => httpRequest(
          `${this.cfg.url}/xmlrpc/2/object`,
          body,
          this.cfg.timeoutMs
        ),
        {
          maxRetries  : 4,
          baseDelayMs : 500,
          maxDelayMs  : 8000,
          shouldRetry : (err) => {
            // No reintentar errores de lógica de Odoo (AccessError, ValidationError)
            if (err.faultCode) return false;
            // Reintentar errores de red y timeouts
            return true;
          },
          onRetry: (attempt, delay, err) => {
            this._stats.retryCalls++;
            this._log('warn', `[${model}.${method}] reintento ${attempt}, delay ${delay}ms: ${err.message}`);
          },
        }
      );

      const result = deserialize(xml);
      this._stats.successCalls++;
      this._log('debug', `[${model}.${method}] OK → ${Array.isArray(result) ? result.length + ' registros' : typeof result}`);
      return result;

    } catch (err) {
      this._stats.errorCalls++;

      // Si el error puede ser por sesión expirada → re-auth y reintentar UNA vez
      if (!err.faultCode && this.authenticated) {
        this._log('warn', `Posible sesión expirada, re-autenticando...`);
        this.authenticated = false;
        await this.authenticate();
        // Un reintento más tras re-auth
        const xml2 = await httpRequest(
          `${this.cfg.url}/xmlrpc/2/object`, body, this.cfg.timeoutMs
        );
        return deserialize(xml2);
      }

      this._log('error', `[${model}.${method}] Error:`, err.message);
      throw err;
    }
  }

  // ── SHORTCUTS ────────────────────────────────

  /** Buscar y leer registros */
  searchRead(model, domain = [], fields = [], opts = {}) {
    return this.execute(model, 'search_read', [domain], {
      fields,
      limit  : opts.limit  || 0,
      offset : opts.offset || 0,
      order  : opts.order  || 'id asc',
    });
  }

  /** Solo IDs */
  search(model, domain = [], opts = {}) {
    return this.execute(model, 'search', [domain], {
      limit  : opts.limit  || 0,
      offset : opts.offset || 0,
      order  : opts.order  || 'id asc',
    });
  }

  /** Contar registros */
  searchCount(model, domain = []) {
    return this.execute(model, 'search_count', [domain]);
  }

  /** Leer por IDs */
  read(model, ids, fields = []) {
    return this.execute(model, 'read', [ids], { fields });
  }

  /** Crear registro */
  create(model, values) {
    return this.execute(model, 'create', [values]);
  }

  /** Actualizar registros */
  write(model, ids, values) {
    return this.execute(model, 'write', [ids, values]);
  }

  /** Eliminar registros */
  unlink(model, ids) {
    return this.execute(model, 'unlink', [ids]);
  }

  /** Llamar método custom del modelo */
  call(model, method, ids = [], kwargs = {}) {
    return this.execute(model, method, [ids], kwargs);
  }

  // ── STATS & CLEANUP ──────────────────────────
  stats() {
    return {
      ...this._stats,
      uid          : this.uid,
      authenticated: this.authenticated,
      companyId    : this.cfg.companyId,
      queuePending : this._queue.pending,
      queueActive  : this._queue.active,
      uptime: this._stats.connectedAt
        ? Math.round((Date.now() - this._stats.connectedAt.getTime()) / 1000) + 's'
        : null,
    };
  }

  disconnect() {
    this._stopHeartbeat();
    this.authenticated = false;
    this.uid = null;
    pool.invalidate(this.cfg);
    this.emit('disconnected');
    this._log('debug', 'Desconectado y removido del pool');
  }
}

// ─────────────────────────────────────────────
// FACTORY PRINCIPAL — getConnection()
// ─────────────────────────────────────────────
/**
 * Obtiene o crea una conexión desde el pool.
 * Reutiliza la conexión existente si ya está autenticada.
 *
 * @param {object} cfg — mismos parámetros que OdooConnection
 * @returns {Promise<OdooConnection>}
 */
async function getConnection(cfg) {
  let conn = pool.get(cfg);

  if (conn && conn.authenticated) {
    return conn;
  }

  if (!conn) {
    conn = new OdooConnection(cfg);
    pool.set(cfg, conn);
  }

  await conn.authenticate();
  return conn;
}

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────
export {
  getConnection,
  OdooConnection,
  OdooConnectionPool,
  pool,
  // Utilidades expuestas para testing
  serialize as _serialize,
  deserialize as _deserialize,
};
