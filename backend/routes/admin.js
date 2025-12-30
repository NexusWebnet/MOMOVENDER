// backend/routes/admin.js — FINAL VERSION WITH HISTORY IN MENU

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'fallback_secret';

/* ===================== AUTH ===================== */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token' });
  }

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid token' });
    }
    req.user = decoded;
    next();
  });
};

const isAdmin = (req, res, next) => {
  if (
    !req.user ||
    !['admin', 'owner', 'superadmin', 'queen'].includes(
      (req.user.role || '').toLowerCase().trim()
    )
  ) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

router.use(authenticateToken, isAdmin);

/* ===================== DB HELPER ===================== */
const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) =>
      err ? reject(err) : resolve(results || [])
    );
  });

/* Force JSON on every response */
router.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

/* ===================== DASHBOARD ===================== */
router.get('/dashboard', async (req, res) => {
  try {
    const period = req.query.period || 'day';
    let startDate, endDate;

    const today = new Date();
    endDate = today.toISOString().split('T')[0];

    if (period === 'week') {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - 6);
      startDate = weekStart.toISOString().split('T')[0];
    } else if (period === 'month') {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      startDate = monthStart.toISOString().split('T')[0];
    } else {
      startDate = endDate;
    }

    /* ===== 1. TOTAL SALES ===== */
    const salesSql = `
      SELECT COALESCE(SUM(amount), 0) AS total FROM (
        SELECT amount FROM momo_transactions WHERE created_at >= ? AND created_at <= ? AND status IN ('success', '')
        UNION ALL
        SELECT amount FROM bank_transactions WHERE created_at >= ? AND created_at <= ? AND status IN ('success', '')
        UNION ALL
        SELECT amount FROM airtime_logs WHERE created_at >= ? AND created_at <= ?
        UNION ALL
        SELECT amount FROM sim_sales WHERE created_at >= ? AND created_at <= ? AND status = 'success'
        UNION ALL
        SELECT amount FROM susu_contributions WHERE created_at >= ? AND created_at <= ?
      ) t
    `;
    const [salesRow] = await run(salesSql, [
      startDate, endDate,
      startDate, endDate,
      startDate, endDate,
      startDate, endDate,
      startDate, endDate
    ]);
    const period_sales = Number(salesRow?.total || 0);

    /* ===== 2. TOTAL FLOAT ===== */
    const floatSql = `
      SELECT COALESCE(SUM(a.balance), 0) AS total
      FROM accounts a
      JOIN users u ON a.user_id = u.id
      WHERE u.role IN ('employee', 'manager')
    `;
    const [floatRow] = await run(floatSql);
    const total_float = Number(floatRow?.total || 0);

    /* ===== 3. ACTIVE AGENTS (in period) ===== */
    const activeSql = `
      SELECT COUNT(DISTINCT agent_id) AS count FROM (
        SELECT agent_id FROM momo_transactions WHERE created_at >= ? AND created_at <= ?
        UNION
        SELECT agent_id FROM bank_transactions WHERE created_at >= ? AND created_at <= ?
        UNION
        SELECT employee_id AS agent_id FROM airtime_logs WHERE created_at >= ? AND created_at <= ?
        UNION
        SELECT employee_id AS agent_id FROM sim_sales WHERE created_at >= ? AND created_at <= ?
        UNION
        SELECT agent_id FROM susu_contributions WHERE created_at >= ? AND created_at <= ?
      ) t
    `;
    const [activeRow] = await run(activeSql, [
      startDate, endDate,
      startDate, endDate,
      startDate, endDate,
      startDate, endDate,
      startDate, endDate
    ]);
    const active_agents = Number(activeRow?.count || 0);

    /* ===== 4. RECENT ACTIVITY — FIXED WITH AGENT NAME & CORRECT FORMAT ===== */
    const recentSql = `
      SELECT 
        'MoMo' AS service,
        u.first_name, u.last_name,
        t.amount,
        t.type,
        t.created_at
      FROM momo_transactions t
      JOIN users u ON t.agent_id = u.id
      WHERE t.created_at >= ? AND t.created_at <= ?
      UNION ALL
      SELECT 'Bank', u.first_name, u.last_name, t.amount, t.type, t.created_at
      FROM bank_transactions t
      JOIN users u ON t.agent_id = u.id
      WHERE t.created_at >= ? AND t.created_at <= ?
      UNION ALL
      SELECT 'Airtime', u.first_name, u.last_name, t.amount, 'topup', t.created_at
      FROM airtime_logs t
      JOIN users u ON t.employee_id = u.id
      WHERE t.created_at >= ? AND t.created_at <= ?
      UNION ALL
      SELECT 'SIM Sale', u.first_name, u.last_name, t.amount, 'sale', t.created_at
      FROM sim_sales t
      JOIN users u ON t.employee_id = u.id
      WHERE t.created_at >= ? AND t.created_at <= ?
      UNION ALL
      SELECT 'Susu', u.first_name, u.last_name, t.amount, 'contribution', t.created_at
      FROM susu_contributions t
      JOIN users u ON t.agent_id = u.id
      WHERE t.created_at >= ? AND t.created_at <= ?
      ORDER BY created_at DESC
      LIMIT 10
    `;

    const recent = await run(recentSql, [
      startDate, endDate,
      startDate, endDate,
      startDate, endDate,
      startDate, endDate,
      startDate, endDate
    ]);

    const recent_activity = recent.map(r => ({
      agent_name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Agent',
      type: r.type || 'transaction',
      amount: Number(r.amount || 0),
      service: r.service,
      created_at: new Date(r.created_at).toLocaleString()
    }));

    res.json({
      success: true,
      period_sales,
      total_float,
      active_agents,
      recent_activity
    });

  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      period_sales: 0,
      total_float: 0,
      active_agents: 0,
      recent_activity: []
    });
  }
});

/* ===================== AGENT RANKING — WITH MONTH SUPPORT ===================== */
router.get('/agent-ranking', async (req, res) => {
  try {
    const period = req.query.period || 'day';
    const limit = Math.max(1, parseInt(req.query.limit) || 6);

    let startDate = new Date();
    if (period === 'week') {
      startDate.setDate(startDate.getDate() - 6);
    } else if (period === 'month') {
      startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    }
    const start = startDate.toISOString().split('T')[0];

    const sql = `
      SELECT 
        u.id,
        CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')) AS name,
        COALESCE(SUM(tx.amount), 0) AS total_amount
      FROM users u
      LEFT JOIN (
        SELECT agent_id, amount FROM momo_transactions WHERE created_at >= ?
        UNION ALL SELECT agent_id, amount FROM bank_transactions WHERE created_at >= ?
        UNION ALL SELECT employee_id AS agent_id, amount FROM airtime_logs WHERE created_at >= ?
        UNION ALL SELECT employee_id AS agent_id, amount FROM sim_sales WHERE created_at >= ?
        UNION ALL SELECT agent_id, amount FROM susu_contributions WHERE created_at >= ?
      ) tx ON tx.agent_id = u.id
      WHERE u.role IN ('employee','manager')
      GROUP BY u.id
      ORDER BY total_amount DESC
      LIMIT ?
    `;

    const rows = await run(sql, [start, start, start, start, start, limit]);

    const data = rows.map(r => ({
      name: (r.name || 'Unknown Agent').trim(),
      total_amount: Number(r.total_amount || 0)
    }));

    res.json({ success: true, data });

  } catch (err) {
    console.error('Ranking error:', err);
    res.status(500).json({ success: false, message: 'Server error', data: [] });
  }
});

/* ===================== SALES ANALYTICS ===================== */
router.get('/analytics/sales', async (req, res) => {
  try {
    const days = Math.max(1, parseInt(req.query.days) || 7);

    const sql = `
      SELECT DATE(created_at) AS day, COALESCE(SUM(amount), 0) AS total
      FROM (
        SELECT created_at, amount FROM momo_transactions
        UNION ALL SELECT created_at, amount FROM bank_transactions
        UNION ALL SELECT created_at, amount FROM airtime_logs
        UNION ALL SELECT created_at, amount FROM sim_sales
        UNION ALL SELECT created_at, amount FROM susu_contributions
      ) t
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `;

    const rows = await run(sql, [days]);

    const data = rows.map(r => ({
      day: r.day,
      total: Number(r.total || 0)
    }));

    res.json({ success: true, data });

  } catch (err) {
    console.error('Sales analytics error:', err);
    res.status(500).json({ success: false, message: 'Server error', data: [] });
  }
});

/* ===================== DYNAMIC MENU — NOW INCLUDES "HISTORY" ===================== */
router.get('/menu', async (req, res) => {
  try {
    const menu = [
      { title: "Dashboard", href: "#", icon: "fas fa-tachometer-alt", active: true },
      { title: "All Agents", href: "admin-agents.html", icon: "fas fa-users" },
      { title: "Float Control", href: "admin-float.html", icon: "fas fa-wallet" },
      { title: "Pay Commission", href: "admin-payroll.html", icon: "fas fa-money-bill-wave" },
      { title: "Branches", href: "admin-branch.html", icon: "fas fa-building" },
      { title: "History", href: "admin-history.html", icon: "fas fa-history" },
      { title: "Reports", href: "admin-reports.html", icon: "fas fa-chart-bar" }
    ];
    res.json(menu);
  } catch (err) {
    console.error('Menu error:', err);
    res.status(500).json([]);
  }
});

/* ===================== ONLINE USERS ===================== */
router.get('/online-users', async (req, res) => {
  try {
    const sql = `
      SELECT 
        u.first_name,
        u.last_name,
        u.username,
        lh.device_info,
        lh.ip_address,
        lh.login_time
      FROM login_history lh
      JOIN users u ON lh.user_id = u.id
      WHERE lh.login_time > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
      ORDER BY lh.login_time DESC
    `;

    const rows = await run(sql);

    const users = rows.map(row => ({
      name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username,
      username: row.username || 'unknown',
      device_info: row.device_info || 'Unknown device',
      ip_address: row.ip_address || 'Unknown IP',
      login_time: new Date(row.login_time).toLocaleString()
    }));

    res.json(users);
  } catch (err) {
    console.error('Online users error:', err);
    res.status(500).json([]);
  }
});

module.exports = router;