// backend/routes/admin_report.js — FINAL FIXED & WORKING

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'fallback_secret';

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ success: false, message: 'Invalid token' });
    req.user = decoded;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (!req.user || !['admin', 'owner', 'superadmin', 'queen'].includes((req.user.role || '').toLowerCase().trim())) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

router.use(authenticateToken, requireAdmin);
router.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) {
        console.error('SQL ERROR:', err);
        return reject(err);
      }
      resolve(results || []);
    });
  });

router.get('/', async (req, res) => {
  try {
    let { type = 'month', branch_id = 'all', start, end } = req.query;

    const today = new Date();
    let startDate = start;
    let endDate = end || today.toISOString().split('T')[0];

    if (!startDate) {
      if (type === 'today') {
        startDate = endDate;
      } else if (type === 'week') {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 6);
        startDate = weekStart.toISOString().split('T')[0];
      } else if (type === 'month') {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      } else if (type === 'lastmonth') {
        const last = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        startDate = last.toISOString().split('T')[0];
        endDate = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0];
      } else if (type === 'year') {
        startDate = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
      } else {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      }
    }

    const branchWhere = branch_id !== 'all' ? 'AND u.branch_id = ?' : '';
    const branchParams = branch_id !== 'all' ? [branch_id] : [];

    const dateParams = [startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate];

    // Summary — FIXED: Include agent_id / employee_id in UNION
    const summarySql = `
      SELECT 
        COALESCE(SUM(amount), 0) AS total_volume,
        COUNT(*) AS total_transactions
      FROM (
        SELECT amount, agent_id AS user_id FROM momo_transactions WHERE DATE(created_at) BETWEEN ? AND ?
        UNION ALL
        SELECT amount, agent_id AS user_id FROM bank_transactions WHERE DATE(created_at) BETWEEN ? AND ?
        UNION ALL
        SELECT amount, employee_id AS user_id FROM airtime_logs WHERE DATE(created_at) BETWEEN ? AND ?
        UNION ALL
        SELECT amount, employee_id AS user_id FROM sim_sales WHERE DATE(created_at) BETWEEN ? AND ?
        UNION ALL
        SELECT amount, agent_id AS user_id FROM susu_contributions WHERE DATE(created_at) BETWEEN ? AND ?
      ) t
      JOIN users u ON t.user_id = u.id
      WHERE u.role IN ('employee', 'manager') ${branchWhere}
    `;
    const [summary] = await run(summarySql, [...dateParams, ...branchParams]);

    // Daily Trend
    const dailySql = `
      SELECT DATE(created_at) AS date, COALESCE(SUM(amount), 0) AS total
      FROM (
        SELECT created_at, amount FROM momo_transactions
        UNION ALL SELECT created_at, amount FROM bank_transactions
        UNION ALL SELECT created_at, amount FROM airtime_logs
        UNION ALL SELECT created_at, amount FROM sim_sales
        UNION ALL SELECT created_at, amount FROM susu_contributions
      ) t
      WHERE DATE(created_at) BETWEEN ? AND ?
      GROUP BY date
      ORDER BY date
    `;
    const daily_trend = await run(dailySql, [startDate, endDate]);

    // Top Agents
    const topAgentsSql = `
      SELECT 
        CONCAT(u.first_name, ' ', COALESCE(u.last_name,'')) AS name,
        COALESCE(SUM(t.amount), 0) AS sales
      FROM users u
      LEFT JOIN (
        SELECT agent_id AS user_id, amount FROM momo_transactions WHERE DATE(created_at) BETWEEN ? AND ?
        UNION ALL SELECT agent_id, amount FROM bank_transactions WHERE DATE(created_at) BETWEEN ? AND ?
        UNION ALL SELECT employee_id, amount FROM airtime_logs WHERE DATE(created_at) BETWEEN ? AND ?
        UNION ALL SELECT employee_id, amount FROM sim_sales WHERE DATE(created_at) BETWEEN ? AND ?
        UNION ALL SELECT agent_id, amount FROM susu_contributions WHERE DATE(created_at) BETWEEN ? AND ?
      ) t ON t.user_id = u.id
      WHERE u.role IN ('employee','manager') ${branchWhere}
      GROUP BY u.id
      ORDER BY sales DESC
      LIMIT 10
    `;
    const top_agents = await run(topAgentsSql, [...dateParams, ...branchParams]);

    // Recent Transactions (last 50)
    const txnsSql = `
      SELECT 
        t.created_at AS date,
        CONCAT(u.first_name, ' ', COALESCE(u.last_name,'')) AS agent_name,
        t.amount,
        COALESCE(t.type, 'transaction') AS type,
        'MoMo' AS service
      FROM momo_transactions t
      JOIN users u ON t.agent_id = u.id
      WHERE DATE(t.created_at) BETWEEN ? AND ?
      UNION ALL
      SELECT t.created_at, CONCAT(u.first_name, ' ', COALESCE(u.last_name,'')), t.amount, t.type, 'Bank'
      FROM bank_transactions t
      JOIN users u ON t.agent_id = u.id
      WHERE DATE(t.created_at) BETWEEN ? AND ?
      UNION ALL
      SELECT t.created_at, CONCAT(u.first_name, ' ', COALESCE(u.last_name,'')), t.amount, 'topup', 'Airtime'
      FROM airtime_logs t
      JOIN users u ON t.employee_id = u.id
      WHERE DATE(t.created_at) BETWEEN ? AND ?
      UNION ALL
      SELECT t.created_at, CONCAT(u.first_name, ' ', COALESCE(u.last_name,'')), t.amount, 'sale', 'SIM'
      FROM sim_sales t
      JOIN users u ON t.employee_id = u.id
      WHERE DATE(t.created_at) BETWEEN ? AND ?
      UNION ALL
      SELECT t.created_at, CONCAT(u.first_name, ' ', COALESCE(u.last_name,'')), t.amount, 'contribution', 'Susu'
      FROM susu_contributions t
      JOIN users u ON t.agent_id = u.id
      WHERE DATE(t.created_at) BETWEEN ? AND ?
      ORDER BY date DESC
      LIMIT 50
    `;
    const transactions = await run(txnsSql, [startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate]);

    // Branches list
    const branches = await run('SELECT id, name FROM branches ORDER BY name');

    res.json({
      success: true,
      summary: {
        total_volume: Number(summary.total_volume || 0),
        total_transactions: Number(summary.total_transactions || 0),
        total_commission: 0,
        float_change: 0
      },
      daily_trend: daily_trend.map(d => ({ date: d.date, total: Number(d.total) })),
      top_agents: top_agents.map(a => ({ name: a.name.trim() || 'Unknown Agent', sales: Number(a.sales) })),
      transactions: transactions.map(t => ({
        date: t.date,
        agent_name: t.agent_name.trim() || 'Agent',
        type: t.type,
        amount: Number(t.amount),
        service: t.service
      })),
      branches
    });
  } catch (err) {
    console.error('Reports error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;