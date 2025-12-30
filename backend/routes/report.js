// backend/routes/report.js — UPDATED TO USE COOKIES (httpOnly authToken)
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');

// Middleware: Read token from httpOnly cookie (no header needed)
const authenticateToken = (req, res, next) => {
  const token = req.cookies.authToken; // ← Reads from cookie

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid token' });
    }
    req.user = decoded;
    next();
  });
};

// Optional: Admin check (if reports are admin-only)
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  const role = (req.user.role || '').toString().toLowerCase().trim();
  if (['admin', 'owner', 'superadmin', 'queen'].includes(role)) {
    return next();
  }

  return res.status(403).json({ success: false, message: 'Admin access required' });
};

// Apply auth (and optionally admin check) to all routes
router.use(authenticateToken, requireAdmin); // ← Remove requireAdmin if reports are public

// Helper: Date range
const getDateRange = (type, customStart, customEnd) => {
  const now = new Date();
  let start = new Date(now.getFullYear(), now.getMonth(), 1);
  let end = new Date();

  if (type === 'lastmonth') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (type === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
  } else if (type === 'custom' && customStart && customEnd) {
    start = new Date(customStart);
    end = new Date(customEnd);
  }

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
};

// GET /api/reports
router.get('/', async (req, res) => {
  const { type = 'month', start, end, branch_id } = req.query;
  const { start: startDate, end: endDate } = getDateRange(type, start, end);

  try {
    const branches = await new Promise((resolve, reject) => {
      db.query(`SELECT id, name FROM branches ORDER BY name`, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    const branchFilter = (branch_id && branch_id !== 'all') ? ' AND u.branch_id = ? ' : '';
    const branchParam = (branch_id && branch_id !== 'all') ? branch_id : null;

    const params = branchParam 
      ? [startDate, endDate, branchParam, startDate, endDate, branchParam, startDate, endDate, branchParam, startDate, endDate, branchParam, startDate, endDate, branchParam]
      : [startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate];

    const transactions = await new Promise((resolve, reject) => {
      db.query(`
        SELECT 
          DATE(mt.created_at) as date,
          CONCAT(u.first_name, ' ', u.last_name) as agent_name,
          'momo_deposit' as service_type,
          mt.amount,
          mt.type as sub_type,
          mt.network,
          u.branch_id
        FROM momo_transactions mt
        JOIN users u ON mt.agent_id = u.id
        WHERE DATE(mt.created_at) BETWEEN ? AND ? AND mt.type = 'deposit' ${branchFilter}

        UNION ALL

        SELECT 
          DATE(mt.created_at) as date,
          CONCAT(u.first_name, ' ', u.last_name) as agent_name,
          'momo_withdraw' as service_type,
          mt.amount,
          mt.type as sub_type,
          mt.network,
          u.branch_id
        FROM momo_transactions mt
        JOIN users u ON mt.agent_id = u.id
        WHERE DATE(mt.created_at) BETWEEN ? AND ? AND mt.type = 'withdraw' ${branchFilter}

        UNION ALL

        SELECT 
          DATE(bt.created_at) as date,
          CONCAT(u.first_name, ' ', u.last_name) as agent_name,
          CONCAT('bank_', LOWER(bt.type)) as service_type,
          bt.amount,
          bt.type as sub_type,
          bt.bank_name as network,
          u.branch_id
        FROM bank_transactions bt
        JOIN users u ON bt.agent_id = u.id
        WHERE DATE(bt.created_at) BETWEEN ? AND ? ${branchFilter}

        UNION ALL

        SELECT 
          DATE(al.created_at) as date,
          CONCAT(u.first_name, ' ', u.last_name) as agent_name,
          'airtime' as service_type,
          al.amount,
          'airtime' as sub_type,
          al.network,
          u.branch_id
        FROM airtime_logs al
        JOIN users u ON al.employee_id = u.id
        WHERE DATE(al.created_at) BETWEEN ? AND ? ${branchFilter}

        UNION ALL

        SELECT 
          DATE(ss.created_at) as date,
          CONCAT(u.first_name, ' ', u.last_name) as agent_name,
          'sim_sale' as service_type,
          ss.amount,
          'sim' as sub_type,
          ss.network,
          u.branch_id
        FROM sim_sales ss
        JOIN users u ON ss.employee_id = u.id
        WHERE DATE(ss.created_at) BETWEEN ? AND ? ${branchFilter}

        ORDER BY date DESC
      `, params, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    const rules = await new Promise((resolve, reject) => {
      db.query(`SELECT service_type, rate_percent FROM commission_rules WHERE branch_id IS NULL OR branch_id = 0`, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    const rulesMap = { default: 1.50 };
    rules.forEach(r => {
      rulesMap[r.service_type] = parseFloat(r.rate_percent);
    });

    let total_volume = 0;
    let total_commission = 0;
    const agentMap = {};

    transactions.forEach(t => {
      const amount = parseFloat(t.amount || 0);
      total_volume += amount;

      const serviceKey = t.service_type || 'default';
      const rate = (rulesMap[serviceKey] || rulesMap.default) / 100;
      const commission = amount * rate;
      total_commission += commission;

      const name = t.agent_name || 'Unknown Agent';
      if (!agentMap[name]) agentMap[name] = { sales: 0, commission: 0 };
      agentMap[name].sales += amount;
      agentMap[name].commission += commission;
    });

    const floatParams = branchParam ? [startDate, endDate, branchParam] : [startDate, endDate];
    const floatFilter = branchParam ? ' AND u.branch_id = ?' : '';
    const floatData = await new Promise((resolve, reject) => {
      db.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN type='deposit' THEN amount ELSE 0 END), 0) as deposits,
          COALESCE(SUM(CASE WHEN type='withdraw' THEN amount ELSE 0 END), 0) as withdrawals
        FROM momo_transactions mt
        JOIN users u ON mt.agent_id = u.id
        WHERE DATE(mt.created_at) BETWEEN ? AND ? ${floatFilter}
      `, floatParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    const float_change = floatData[0].deposits - floatData[0].withdrawals;

    const dailyMap = {};
    transactions.forEach(t => {
      const d = t.date;
      dailyMap[d] = (dailyMap[d] || 0) + parseFloat(t.amount || 0);
    });
    const daily_trend = Object.keys(dailyMap).sort().map(d => ({
      date: d,
      total: parseFloat(dailyMap[d].toFixed(2))
    }));

    const agents = Object.entries(agentMap)
      .map(([name, data]) => ({
        name,
        sales: parseFloat(data.sales.toFixed(2)),
        commission: parseFloat(data.commission.toFixed(2))
      }))
      .sort((a, b) => b.sales - a.sales);

    const top_agents = agents.slice(0, 10);

    res.json({
      period: `${startDate} to ${endDate}`,
      branch_id: branch_id || 'all',
      branches,
      summary: {
        total_volume: parseFloat(total_volume.toFixed(2)),
        total_transactions: transactions.length,
        total_commission: parseFloat(total_commission.toFixed(2)),
        float_change: parseFloat(float_change.toFixed(2))
      },
      transactions: transactions.map(t => ({
        date: t.date,
        agent_name: t.agent_name,
        type: t.service_type.replace('_', ' ').toUpperCase(),
        amount: parseFloat(t.amount || 0),
        service: t.network || t.bank_name || t.service_type.replace('_', ' ')
      })),
      daily_trend,
      agents,
      top_agents
    });

  } catch (err) {
    console.error('Report Generation Failed:', err);
    res.status(500).json({ 
      error: 'Failed to generate report', 
      details: err.message 
    });
  }
});

module.exports = router;