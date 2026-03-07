/**
 * ============================================================
 * EJEMPLOS DE USO — odoo_connector.js (ESM)
 * ============================================================
 */

import { getConnection, pool } from '../odoo_connector.js';

// ─────────────────────────────────────────────
// CONFIGURACIÓN (una por compañía)
// ─────────────────────────────────────────────
const CONFIG_CIA1 = {
  url       : 'https://miodoo.com',
  db        : 'mi_base_de_datos',
  username  : 'admin@empresa.com',
  password  : 'mi_password_seguro',
  companyId : 1,                   // ID de la compañía en Odoo

  // Opcionales (tienen defaults)
  heartbeatMs : 60_000,            // ping cada 60s para mantener sesión
  timeoutMs   : 30_000,            // timeout por request
  concurrency : 3,                 // máximo 3 llamadas paralelas
  debug       : false,             // true para ver logs detallados
};

// ─────────────────────────────────────────────
// EJEMPLO 1 — Uso básico
// ─────────────────────────────────────────────
export async function ejemplo1_basico() {
  // getConnection() autentica y devuelve la conexión del pool
  // La segunda llamada reutiliza la sesión (no re-autentica)
  const odoo = await getConnection(CONFIG_CIA1);

  // Leer productos activos
  const productos = await odoo.searchRead(
    'product.product',
    [['active', '=', true], ['sale_ok', '=', true]],
    ['id', 'name', 'default_code', 'list_price', 'qty_available'],
    { limit: 100 }
  );

  console.log(`Productos: ${productos.length}`);
  if (productos.length > 0) console.log(productos[0]);
  // → { id: 42, name: 'Arroz Extra', default_code: 'ARROZ001', list_price: 120.0, qty_available: 500 }
}

// ─────────────────────────────────────────────
// EJEMPLO 2 — Multicompañía
// ─────────────────────────────────────────────
export async function ejemplo2_multicompania() {
  // Cada compañía tiene su propia conexión en el pool
  const [odoo1, odoo2] = await Promise.all([
    getConnection({ ...CONFIG_CIA1, companyId: 1 }),
    getConnection({ ...CONFIG_CIA1, companyId: 2 }),
  ]);

  // Corren en paralelo, el contexto allowed_company_ids se inyecta automáticamente
  const [prods1, prods2] = await Promise.all([
    odoo1.searchRead('product.product', [['active', '=', true]], ['name', 'list_price']),
    odoo2.searchRead('product.product', [['active', '=', true]], ['name', 'list_price']),
  ]);

  console.log(`Cía 1: ${prods1.length} productos`);
  console.log(`Cía 2: ${prods2.length} productos`);
  console.log(`Pool size: ${pool.size}`); // → 2
}

// ─────────────────────────────────────────────
// EJEMPLO 3 — Crear pedido de venta completo
// ─────────────────────────────────────────────
export async function ejemplo3_crear_pedido(partnerId, items, pricelistId) {
  const odoo = await getConnection(CONFIG_CIA1);

  // items = [{ product_id: 42, qty: 5, price: 120.00 }, ...]

  const orderLines = items.map(item => [
    0, 0,
    {
      product_id      : item.product_id,
      product_uom_qty : item.qty,
      price_unit      : item.price,
    }
  ]);

  // Crear el pedido (sale.order)
  const orderId = await odoo.create('sale.order', {
    partner_id   : partnerId,
    pricelist_id : pricelistId,
    order_line   : orderLines,
    note         : 'Pedido vía WhatsApp',
  });

  console.log(`Pedido creado con ID: ${orderId}`);

  // Leer el número de referencia generado por Odoo
  const [order] = await odoo.read('sale.order', [orderId], ['name', 'amount_total', 'state']);
  console.log(`Ref: ${order.name}, Total: S/ ${order.amount_total}`);
  // → Ref: S/0042, Total: S/ 600.00

  return { orderId, ref: order.name, total: order.amount_total };
}

// ─────────────────────────────────────────────
// EJEMPLO 4 — Sincronización masiva (para n8n)
// ─────────────────────────────────────────────
export async function ejemplo4_sync_para_supabase() {
  const odoo = await getConnection(CONFIG_CIA1);

  // Obtener total de productos primero
  const total = await odoo.searchCount('product.product', [
    ['active', '=', true],
    ['sale_ok', '=', true],
  ]);
  console.log(`Total a sincronizar: ${total}`);

  // Paginar en lotes de 200
  const BATCH = 200;
  const allProducts = [];

  for (let offset = 0; offset < total; offset += BATCH) {
    const batch = await odoo.searchRead(
      'product.product',
      [['active', '=', true], ['sale_ok', '=', true]],
      ['id', 'name', 'default_code', 'list_price', 'uom_id', 'categ_id', 'qty_available'],
      { limit: BATCH, offset }
    );
    allProducts.push(...batch);
    console.log(`  Procesados: ${allProducts.length}/${total}`);
  }

  return allProducts;
}

// ─────────────────────────────────────────────
// EJEMPLO 5 — Eventos del conector
// ─────────────────────────────────────────────
export async function ejemplo5_eventos() {
  const odoo = await getConnection({ ...CONFIG_CIA1, debug: true, heartbeatMs: 10_000 });

  // Escuchar eventos
  odoo.on('authenticated', (uid) => {
    console.log(`✅ Autenticado con uid: ${uid}`);
  });

  odoo.on('heartbeat', ({ ok, error }) => {
    if (ok) console.log('💓 Heartbeat OK - sesión activa');
    else    console.warn('💔 Heartbeat falló:', error);
  });

  odoo.on('error', (err) => {
    console.error('❌ Error crítico en conexión:', err.message);
  });

  odoo.on('disconnected', () => {
    console.log('🔌 Conexión cerrada');
  });

  // Ver estadísticas de la conexión
  await odoo.searchRead('res.partner', [['customer_rank', '>', 0]], ['name'], { limit: 5 });
  console.log('\nEstadísticas:', JSON.stringify(odoo.stats(), null, 2));
}

// ─────────────────────────────────────────────
// EJEMPLO 6 — Uso desde n8n (nodo Code)
// ─────────────────────────────────────────────
// Pegar esto directamente en un nodo "Code" de n8n:
/*
const { getConnection } = require('/ruta/a/odoo_connector');

const cfg = {
  url       : $env.ODOO_URL,
  db        : $env.ODOO_DB,
  username  : $env.ODOO_USER,
  password  : $env.ODOO_PASS,
  companyId : parseInt($env.ODOO_COMPANY_ID),
};

const odoo = await getConnection(cfg);

// El input del nodo anterior puede definir qué buscar
const domain = $input.first().json.domain || [];
const result = await odoo.searchRead('product.product', domain, ['id','name','list_price']);

return result.map(p => ({ json: p }));
*/

// ─────────────────────────────────────────────
// EJEMPLO 7 — Estadísticas del pool global
// ─────────────────────────────────────────────
export function ejemplo7_pool_stats() {
  const stats = pool.stats();
  console.log('Pool global:');
  for (const [key, s] of Object.entries(stats)) {
    console.log(`  ${key}:`);
    console.log(`    Autenticado: ${s.authenticated}`);
    console.log(`    Llamadas: ${s.totalCalls} (ok: ${s.successCalls}, err: ${s.errorCalls}, retry: ${s.retryCalls})`);
    console.log(`    Uptime: ${s.uptime}`);
    console.log(`    Cola: ${s.queuePending} pendientes, ${s.queueActive} activos`);
  }
}
