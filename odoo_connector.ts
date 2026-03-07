/**
 * odoo_connector.ts — ESM compatible
 * Importado desde server.ts como: import { getConnection } from "./odoo_connector.js"
 *
 * Características:
 *   - Pool de conexiones por compañía (reutiliza sesiones)
 *   - Heartbeat activo para mantener sesión viva
 *   - Retry con backoff exponencial + jitter
 *   - Filtro automático por compañía (allowed_company_ids)
 *   - Sin dependencias externas (solo Node.js built-ins)
 */

import http from 'http';
import https from 'https';
import { EventEmitter } from 'events';

// ─────────────────────────────────────────────
// XML-RPC SERIALIZER
// ─────────────────────────────────────────────
function serialize(value: any): string {
  if (value === null || value === undefined) return '<value><nil/></value>';
  if (typeof value === 'boolean') return `<value><boolean>${value ? 1 : 0}</boolean></value>`;
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
function deserialize(xml: string): any {
  if (xml.includes('<fault>')) {
    const codeMatch = xml.match(/<n>faultCode<\/n>\s*<value>(?:<int>|<i4>)(\d+)/);
    const strMatch = xml.match(/<n>faultString<\/n>\s*<value><string>([\s\S]*?)<\/string>/);
    const err: any = new Error(`Odoo Fault [${codeMatch?.[1] ?? 0}]: ${strMatch?.[1]?.trim() ?? 'Unknown fault'}`);
    err.faultCode = codeMatch ? parseInt(codeMatch[1]) : 0;
    throw err;
  }

  const paramMatch = xml.match(/<params>\s*<param>\s*([\s\S]*?)\s*<\/param>\s*<\/params>/);
  if (!paramMatch) throw new Error('Invalid XML-RPC response: no params block found');
  return parseValue(paramMatch[1].trim());
}

function parseValue(xml: string): any {
  xml = xml.trim();

  // Unwrap <value> tag
  const vMatch = xml.match(/^<value>([\s\S]*)<\/value>$/);
  if (vMatch) return parseValue(vMatch[1].trim());

  // int / i4 / i8
  const intM = xml.match(/^<(?:int|i4|i8)>([\s\S]*?)<\/(?:int|i4|i8)>$/);
  if (intM) return parseInt(intM[1]);

  // double
  const dblM = xml.match(/^<double>([\s\S]*?)<\/double>$/);
  if (dblM) return parseFloat(dblM[1]);

  // boolean
  const boolM = xml.match(/^<boolean>([\s\S]*?)<\/boolean>$/);
  if (boolM) return boolM[1].trim() === '1';

  // string
  const strM = xml.match(/^<string>([\s\S]*?)<\/string>$/);
  if (strM) return strM[1]
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

  if (xml === '<nil/>' || xml === '<nil></nil>') return null;
  if (xml === '<string/>' || xml === '<string></string>') return '';

  // array
  if (xml.startsWith('<array>')) {
    const dataM = xml.match(/<data>([\s\S]*)<\/data>/);
    if (!dataM) return [];
    const items: any[] = [];
    const re = /<value>([\s\S]*?)<\/value>/g;
    let m;
    while ((m = re.exec(dataM[1])) !== null) items.push(parseValue(m[1].trim()));
    return items;
  }

  // struct
  if (xml.startsWith('<struct>')) {
    const obj: any = {};
    const memberRe = /<member>([\s\S]*?)<\/member>/g;
    let m;
    while ((m = memberRe.exec(xml)) !== null) {
      const nameM = m[1].match(/<n>([\s\S]*?)<\/n>/);
      const valM = m[1].match(/<value>([\s\S]*?)<\/value>/);
      if (nameM && valM) obj[nameM[1]] = parseValue(valM[1].trim());
    }
    return obj;
  }

  // plain text (string without tags)
  if (!xml.startsWith('<')) return xml;
  return null;
}

// ─────────────────────────────────────────────
// HTTP REQUEST (sin dependencias externas)
// ─────────────────────────────────────────────
function httpRequest(urlStr: string, body: string, timeoutMs = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;
    const buf = Buffer.from(body, 'utf8');

    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Content-Length': buf.length,
        'Connection': 'keep-alive',
      },
      timeout: timeoutMs,
    }, (res) => {
      const chunks: any[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout after ${timeoutMs}ms`)); });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// ─────────────────────────────────────────────
// RETRY con backoff exponencial + jitter
// ─────────────────────────────────────────────
async function withRetry(fn: () => Promise<any>, { maxRetries = 4, baseDelayMs = 500, maxDelayMs = 10000, shouldRetry = (e: any) => true as boolean, onRetry = null as any } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries || !shouldRetry(err)) throw err;
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs) * (1 + Math.random() * 0.3);
      if (onRetry) onRetry(attempt, Math.round(delay), err);
      await new Promise(r => setTimeout(r, Math.round(delay)));
    }
  }
  throw lastErr;
}

// ─────────────────────────────────────────────
// REQUEST QUEUE — controla concurrencia
// ─────────────────────────────────────────────
class RequestQueue {
  concurrency: number;
  running: number;
  queue: any[];

  constructor(concurrency = 3) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }
  add(fn: () => Promise<any>): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._run();
    });
  }
  async _run() {
    if (this.running >= this.concurrency || !this.queue.length) return;
    this.running++;
    const item = this.queue.shift();
    if (!item) return;
    const { fn, resolve, reject } = item;
    try { resolve(await fn()); } catch (err) { reject(err); } finally {
      this.running--;
      this._run();
    }
  }
}

// ─────────────────────────────────────────────
// ODOO CONNECTION
// ─────────────────────────────────────────────
class OdooConnection extends EventEmitter {
  cfg: any;
  uid: number | null = null;
  authenticated = false;
  _heartbeatTimer: any = null;
  _authPromise: Promise<any> | null = null;
  _queue: RequestQueue;
  _stats: any;

  constructor(cfg: any) {
    super();
    if (!cfg.url || !cfg.db || !cfg.username || !cfg.password || !cfg.companyId) {
      throw new Error('OdooConnection requiere: url, db, username, password, companyId');
    }
    this.cfg = {
      heartbeatMs: 60_000,
      timeoutMs: 30_000,
      concurrency: 3,
      debug: false,
      ...cfg,
      url: cfg.url.replace(/\/+$/, ''), // quitar trailing slashes
    };
    this._queue = new RequestQueue(this.cfg.concurrency);
    this._stats = { totalCalls: 0, successCalls: 0, errorCalls: 0, retryCalls: 0, authCount: 0, lastCallAt: null, connectedAt: null };
  }

  _log(level: string, ...args: any[]) {
    if (level === 'debug' && !this.cfg.debug) return;
    const prefix = `[Odoo][cía:${this.cfg.companyId}]`;
    if (level === 'error') console.error(prefix, ...args);
    else if (level === 'warn') console.warn(prefix, ...args);
    else console.log(prefix, ...args);
  }

  // ── AUTENTICACIÓN ────────────────────────────
  async authenticate() {
    if (this._authPromise) return this._authPromise;
    this._authPromise = this._doAuth().finally(() => { this._authPromise = null; });
    return this._authPromise;
  }

  async _doAuth() {
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
      { maxRetries: 3, baseDelayMs: 1000, onRetry: (a: any, d: any) => this._log('warn', `Auth reintento ${a}, delay ${d}ms`) }
    );

    const uid = deserialize(xml);
    if (!uid || uid === false || uid === 0) {
      throw new Error('Autenticación fallida: credenciales incorrectas o usuario sin acceso a esta compañía');
    }

    this.uid = uid;
    this.authenticated = true;
    this._stats.authCount++;
    this._stats.connectedAt = new Date();
    this._log('debug', `Autenticado OK, uid=${uid}`);
    this.emit('authenticated', uid);
    this._startHeartbeat();
  }

  // ── HEARTBEAT ────────────────────────────────
  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(async () => {
      try {
        await httpRequest(`${this.cfg.url}/xmlrpc/2/common`,
          `<?xml version="1.0"?><methodCall><methodName>version</methodName><params></params></methodCall>`,
          10_000
        );
        this.emit('heartbeat', { ok: true });
      } catch (err: any) {
        this._log('warn', 'Heartbeat falló, re-autenticando:', err.message);
        this.authenticated = false;
        this.uid = null;
        this.emit('heartbeat', { ok: false, error: err.message });
        try { await this.authenticate(); } catch (e) { this.emit('error', e); }
      }
    }, this.cfg.heartbeatMs);

    if (this._heartbeatTimer.unref) this._heartbeatTimer.unref();
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null; }
  }

  // ── EXECUTE_KW ───────────────────────────────
  async execute(model: string, method: string, args: any[] = [], kwargs: any = {}) {
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

    return this._queue.add(() => this._doExecute(model, method, args, kwargs));
  }

  async _doExecute(model: string, method: string, args: any[], kwargs: any) {
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
        () => httpRequest(`${this.cfg.url}/xmlrpc/2/object`, body, this.cfg.timeoutMs),
        {
          maxRetries: 4,
          baseDelayMs: 500,
          shouldRetry: (err: any) => !err.faultCode, // no reintentar errores de lógica Odoo
          onRetry: (a: any, d: any, err: any) => {
            this._stats.retryCalls++;
            this._log('warn', `[${model}.${method}] reintento ${a} (${d}ms): ${err.message}`);
          },
        }
      );

      const result = deserialize(xml);
      this._stats.successCalls++;
      return result;

    } catch (err: any) {
      this._stats.errorCalls++;
      // Si puede ser sesión expirada (error de red, no fault), re-auth y un reintento más
      if (!err.faultCode) {
        this._log('warn', 'Posible sesión expirada, re-autenticando...');
        this.authenticated = false;
        await this.authenticate();
        const xml2 = await httpRequest(`${this.cfg.url}/xmlrpc/2/object`, body, this.cfg.timeoutMs);
        return deserialize(xml2);
      }
      throw err;
    }
  }

  // ── SHORTCUTS ────────────────────────────────
  searchRead(model: string, domain: any[] = [], fields: string[] = [], opts: any = {}) {
    return this.execute(model, 'search_read', [domain], {
      fields, limit: opts.limit || 0, offset: opts.offset || 0, order: opts.order || 'id asc',
    });
  }
  search(model: string, domain: any[] = [], opts: any = {}) {
    return this.execute(model, 'search', [domain], { limit: opts.limit || 0, offset: opts.offset || 0 });
  }
  searchCount(model: string, domain: any[] = []) { return this.execute(model, 'search_count', [domain]); }
  read(model: string, ids: number[], fields: string[] = []) { return this.execute(model, 'read', [ids], { fields }); }
  create(model: string, values: any) { return this.execute(model, 'create', [values]); }
  write(model: string, ids: number[], values: any) { return this.execute(model, 'write', [ids, values]); }
  unlink(model: string, ids: number[]) { return this.execute(model, 'unlink', [ids]); }

  stats() {
    return {
      ...this._stats,
      uid: this.uid,
      authenticated: this.authenticated,
      companyId: this.cfg.companyId,
      url: this.cfg.url,
      uptime: this._stats.connectedAt
        ? Math.round((Date.now() - this._stats.connectedAt.getTime()) / 1000) + 's'
        : null,
    };
  }

  disconnect() {
    this._stopHeartbeat();
    this.authenticated = false;
    this.uid = null;
    connectionPool.delete(_poolKey(this.cfg));
    this.emit('disconnected');
  }
}

// ─────────────────────────────────────────────
// CONNECTION POOL (singleton Map)
// ─────────────────────────────────────────────
const connectionPool = new Map<string, OdooConnection>();

function _poolKey(cfg: any) {
  return `${cfg.url}::${cfg.db}::${cfg.companyId}`;
}

/**
 * Obtiene o crea una conexión del pool.
 * Si la conexión ya existe y está autenticada, la reutiliza.
 *
 * @param {object} cfg — mismos parámetros que OdooConnection
 * @returns {Promise<OdooConnection>}
 */
async function getConnection(cfg: any): Promise<OdooConnection> {
  // Normalizar URL antes de usar como key
  const normalizedCfg = { ...cfg, url: (cfg.url || '').replace(/\/+$/, '') };
  const key = _poolKey(normalizedCfg);

  let conn = connectionPool.get(key);

  if (conn && conn.authenticated) {
    return conn;
  }

  if (!conn) {
    conn = new OdooConnection(normalizedCfg);
    connectionPool.set(key, conn);
  }

  await conn.authenticate();
  return conn;
}

// ─────────────────────────────────────────────
// EXPORTS (ESM)
// ─────────────────────────────────────────────
export { getConnection, OdooConnection, connectionPool };
