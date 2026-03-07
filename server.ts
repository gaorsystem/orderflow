import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { getConnection } from "./odoo_connector.js";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Supabase Client (Server-side with Service Role)
  const getSupabase = () => {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  };

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "OrderFlow API is running" });
  });

  // Odoo Connection Helper
  const getOdooConn = async () => {
    const { ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, ODOO_COMPANY_ID } = process.env;
    if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
      return null;
    }
    let url = ODOO_URL.trim();
    if (url.endsWith('.')) url = url.slice(0, -1);
    if (url.endsWith('/')) url = url.slice(0, -1);

    return await getConnection({
      url: url,
      db: ODOO_DB.trim(),
      username: ODOO_USERNAME.trim(),
      password: ODOO_PASSWORD.trim(),
      companyId: parseInt(ODOO_COMPANY_ID || "1"),
      debug: true
    });
  };

  // Odoo API Endpoints
  app.get("/api/odoo/test", async (req, res) => {
    try {
      const conn = await getOdooConn();
      if (!conn) {
        return res.status(400).json({ error: "Odoo credentials not configured in environment" });
      }
      const stats = conn.stats();
      res.json({ status: "ok", stats });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/odoo/stats", async (req, res) => {
    try {
      const conn = await getOdooConn();
      if (!conn) {
        return res.json({
          products: 247,
          partners: 89,
          pending: 2,
          confirmed: 14,
          is_demo: true
        });
      }

      const [products, partners] = await Promise.all([
        conn.searchCount('product.product', [['sale_ok', '=', true]]),
        conn.searchCount('res.partner', [['customer_rank', '>', 0]])
      ]);

      // Try to get real counts from Supabase if available
      const supabase = getSupabase();
      let pending = 0;
      let confirmed = 0;

      if (supabase) {
        const { count: pendingCount } = await supabase
          .from('pedidos_queue')
          .select('*', { count: 'exact', head: true })
          .eq('estado', 'pending');
        
        const { count: confirmedCount } = await supabase
          .from('pedidos_queue')
          .select('*', { count: 'exact', head: true })
          .eq('estado', 'confirmed');
        
        pending = pendingCount || 0;
        confirmed = confirmedCount || 0;
      }

      res.json({
        products,
        partners,
        pending,
        confirmed,
        is_demo: false
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Dashboard API Endpoints
  app.get("/api/stats", async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) {
      return res.json({
        active_sessions: Math.floor(Math.random() * 20) + 5,
        pending_orders: Math.floor(Math.random() * 10),
        sync_status: "OK",
        last_sync: new Date().toISOString()
      });
    }

    try {
      const [sessions, pending, logs] = await Promise.all([
        supabase.from('whatsapp_sessions').select('*', { count: 'exact', head: true }).neq('estado', 'idle'),
        supabase.from('pedidos_queue').select('*', { count: 'exact', head: true }).eq('estado', 'pending'),
        supabase.from('sync_log').select('*').order('created_at', { ascending: false }).limit(1)
      ]);

      res.json({
        active_sessions: sessions.count || 0,
        pending_orders: pending.count || 0,
        sync_status: logs.data?.[0]?.estado === 'ok' ? "OK" : "WARNING",
        last_sync: logs.data?.[0]?.created_at || new Date().toISOString()
      });
    } catch (err) {
      res.json({ active_sessions: 0, pending_orders: 0, sync_status: "ERROR", last_sync: null });
    }
  });

  app.get("/api/recent-orders", async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) return res.json([]);

    const { data } = await supabase
      .from('pedidos_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    res.json(data || []);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
