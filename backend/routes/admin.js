// backend/routes/admin.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('./auth');

// Admin middleware
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ success: false, message: 'Admin access required' });
};

router.use(authenticateToken, isAdmin);

// Promise wrapper for db.query
const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) {
        console.error('SQL ERROR:', err.sqlMessage || err);
        return reject(err);
      }
      resolve(results);
    });
  });

// GET /api/admin/dashboard — Main admin dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Today's total sales across all services
    const salesSql = `
      SELECT COALESCE(SUM(amount), 0) AS total FROM (
        SELECT amount FROM momo_transactions WHERE DATE(created_at) = ?
        UNION ALL SELECT amount FROM bank_transactions WHERE DATE(created_at) = ?
        UNION ALL SELECT amount FROM airtime_logs WHERE DATE(created_at) = ?
        UNION ALL SELECT amount FROM sim_sales WHERE DATE(created_at) = ?
        UNION ALL SELECT amount FROM susu_contributions WHERE DATE(created_at) = ?
      ) t
    `;
    const [salesRow] = await run(salesSql, [today, today, today, today, today]);
    const today_sales = parseFloat(salesRow.total || 0);

    // Total float balance
    const [floatRow] = await run('SELECT COALESCE(SUM(balance), 0) AS total FROM accounts');
    const total_float = parseFloat(floatRow.total || 0);

    // Active agents today
    const activeSql = `
      SELECT COUNT(DISTINCT agent_id) AS count FROM (
        SELECT agent_id FROM momo_transactions WHERE DATE(created_at) = ?
        UNION SELECT agent_id FROM bank_transactions WHERE DATE(created_at) = ?
        UNION SELECT employee_id AS agent_id FROM airtime_logs WHERE DATE(created_at) = ?
        UNION SELECT employee_id AS agent_id FROM sim_sales WHERE DATE(created_at) = ?
        UNION SELECT agent_id FROM susu_contributions WHERE DATE(created_at) = ?
      ) t
    `;
    const [activeRow] = await run(activeSql, [today, today, today, today, today]);
    const active_agents = parseInt(activeRow.count || 0);

    // Recent activity (last 10 transactions today)
    const recentSql = `
      SELECT 
        'MoMo' AS service,
        transaction_id,
        COALESCE(customer_name, 'Customer') AS customer_name,
        amount,
        type,
        COALESCE(network, '') AS network,
        created_at
      FROM momo_transactions WHERE DATE(created_at) = ?
      UNION ALL
      SELECT 
        'Bank' AS service,
        transaction_id,
        COALESCE(customer_name, 'Customer') AS customer_name,
        amount,
        type,
        COALESCE(bank_name, '') AS network,
        created_at
      FROM bank_transactions WHERE DATE(created_at) = ?
      UNION ALL
      SELECT 
        'Airtime' AS service,
        CAST(id AS CHAR) AS transaction_id,
        COALESCE(customer_name, 'Customer') AS customer_name,
        amount,
        'topup' AS type,
        COALESCE(network, '') AS network,
        created_at
      FROM airtime_logs WHERE DATE(created_at) = ?
      UNION ALL
      SELECT 
        'SIM' AS service,
        transaction_id,
        COALESCE(customer_name, 'Customer') AS customer_name,
        amount,
        'registration' AS type,
        COALESCE(network, '') AS network,
        created_at
      FROM sim_sales WHERE DATE(created_at) = ?
      UNION ALL
      SELECT 
        'Susu' AS service,
        transaction_id,
        COALESCE(customer_name, 'Customer') AS customer_name,
        amount,
        'contribution' AS type,
        COALESCE(susu_group, '') AS network,
        created_at
      FROM susu_contributions WHERE DATE(created_at) = ?
      ORDER BY created_at DESC
      LIMIT 10
    `;
    const recent = await run(recentSql, [today, today, today, today, today]);

    const recent_activity = recent.map(r => ({
      name: r.customer_name,
      action:
        r.type === 'deposit' ? 'received deposit' :
        r.type === 'withdraw' ? 'sent withdrawal' :
        r.type === 'topup' ? 'bought airtime' :
        r.type === 'registration' ? 'SIM registration' :
        r.type === 'contribution' ? 'susu contribution' : 'transaction',
      amount: parseFloat(r.amount || 0),
      service: r.service,
      time: new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }));

    res.json({
      success: true,
      data: {
        today_sales,
        total_float,
        active_agents,
        recent_activity
      }
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/admin/analytics/sales — Daily sales for chart
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
      WHERE DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `;
    const rows = await run(sql, [days - 1]);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Sales analytics error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/admin/agent-ranking — Top agents by sales
router.get('/agent-ranking', async (req, res) => {
  try {
    const period = req.query.period || 'day';
    const limit = Math.max(1, parseInt(req.query.limit) || 10);

    let startDate = new Date();
    if (period === 'week') {
      startDate.setDate(startDate.getDate() - 6);
    } else if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    }
    const start = startDate.toISOString().split('T')[0];

    const sql = `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        COALESCE(u.first_name, '') + ' ' + COALESCE(u.last_name, '') AS agent_name,
        COALESCE(SUM(tx.amount), 0) AS total_amount,
        COALESCE(COUNT(tx.amount), 0) AS total_transactions
      FROM users u
      LEFT JOIN (
        SELECT agent_id, amount FROM momo_transactions WHERE DATE(created_at) >= ?
        UNION ALL
        SELECT agent_id, amount FROM bank_transactions WHERE DATE(created_at) >= ?
        UNION ALL
        SELECT employee_id, amount FROM airtime_logs WHERE DATE(created_at) >= ?
        UNION ALL
        SELECT employee_id, amount FROM sim_sales WHERE DATE(created_at) >= ?
        UNION ALL
        SELECT agent_id, amount FROM susu_contributions WHERE DATE(created_at) >= ?
      ) tx ON tx.agent_id = u.id
      WHERE u.role IN ('employee', 'manager')
      GROUP BY u.id
      ORDER BY total_amount DESC
      LIMIT ?
    `;

    const rows = await run(sql, [start, start, start, start, start, limit]);

    const ranking = rows.map(r => ({
      id: r.id,
      name: r.agent_name.trim() || 'Unknown Agent',
      total_amount: parseFloat(r.total_amount || 0),
      total_transactions: parseInt(r.total_transactions || 0)
    }));

    res.json({ success: true, data: ranking });
  } catch (err) {
    console.error('Agent ranking error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/admin/branches — List all branches
router.get('/branches', (req, res) => {
  db.query('SELECT id, name, location FROM branches ORDER BY name', (err, rows) => {
    if (err) {
      console.error("Branches fetch error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
    res.json({ success: true, data: rows });
  });
});

module.exports = router;