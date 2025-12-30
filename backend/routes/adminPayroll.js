// backend/routes/adminPayroll.js — FINAL WORKING VERSION

const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "fallback_secret";

// Bearer token middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
};

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });

  const role = (req.user.role || '').toLowerCase().trim();
  if (['admin', 'owner', 'superadmin', 'queen'].includes(role)) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Admin access required' });
};

// Apply auth + admin check
router.use(authenticateToken, requireAdmin);

// Force JSON responses
router.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

// Promise-based query helper
const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) {
        console.error('SQL ERROR:', err);
        return reject(err);
      }
      resolve(results || []);
    });
  });

// GET /api/payroll/admin — Payroll report with commission calculation
router.get('/admin', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, Math.min(50, parseInt(req.query.limit) || 15));
  const offset = (page - 1) * limit;
  let start = req.query.start || "1970-01-01";
  let end = req.query.end || new Date().toISOString().slice(0, 10);

  try {
    // Earned commission from transactions
    const earnedRows = await query(`
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.username,
        u.role,
        u.branch_id,
        b.name AS branch_name,
        COALESCE(SUM(t.amount * COALESCE(cr.rate_percent, 1.50) / 100), 0) AS earned
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      LEFT JOIN (
        SELECT 'momo' AS service, agent_id AS user_id, amount FROM momo_transactions WHERE DATE(created_at) BETWEEN ? AND ?
        UNION ALL SELECT 'bank', agent_id, amount FROM bank_transactions WHERE DATE(created_at) BETWEEN ? AND ?
        UNION ALL SELECT 'airtime', employee_id, amount FROM airtime_logs WHERE DATE(created_at) BETWEEN ? AND ?
        UNION ALL SELECT 'sim', employee_id, amount FROM sim_sales WHERE DATE(created_at) BETWEEN ? AND ?
        UNION ALL SELECT 'susu', agent_id, amount FROM susu_contributions WHERE DATE(created_at) BETWEEN ? AND ?
      ) t ON t.user_id = u.id
      LEFT JOIN commission_rules cr ON cr.branch_id = u.branch_id AND cr.service_type = t.service
      WHERE u.role IN ('employee', 'manager')
      GROUP BY u.id
      ORDER BY earned DESC
      LIMIT ? OFFSET ?
    `, [start, end, start, end, start, end, start, end, start, end, limit, offset]);

    // Paid amounts from payouts table
    const paidRows = await query(`
      SELECT employee_id, COALESCE(SUM(amount), 0) AS paid
      FROM payouts 
      WHERE DATE(paid_at) BETWEEN ? AND ? AND status = 'success'
      GROUP BY employee_id
    `, [start, end]);

    const paidMap = {};
    paidRows.forEach(row => {
      paidMap[row.employee_id] = parseFloat(row.paid || 0);
    });

    // Build final agent list
    const agents = earnedRows.map(agent => {
      const earned = parseFloat(agent.earned || 0);
      const paid = paidMap[agent.id] || 0;
      const pending = Math.max(0, earned - paid); // Prevent negative

      return {
        id: agent.id,
        first_name: agent.first_name || '',
        last_name: agent.last_name || '',
        full_name: `${agent.first_name || ''} ${agent.last_name || ''}`.trim() || agent.username,
        username: agent.username || 'unknown',
        role: agent.role || 'employee',
        branch_name: agent.branch_name || 'No Branch',
        earned: parseFloat(earned.toFixed(2)),
        paid: parseFloat(paid.toFixed(2)),
        pending: parseFloat(pending.toFixed(2))
      };
    });

    // Summary stats
    const totalPayable = parseFloat(agents.reduce((sum, a) => sum + a.earned, 0).toFixed(2));
    const totalPaid = parseFloat(agents.reduce((sum, a) => sum + a.paid, 0).toFixed(2));
    const totalPending = parseFloat((totalPayable - totalPaid).toFixed(2));

    res.json({
      success: true,
      agents,
      stats: {
        totalPayable,
        totalPaid,
        totalPending,
        totalAgents: agents.length
      },
      period: { start, end },
      pagination: {
        page,
        limit,
        hasMore: agents.length === limit
      }
    });
  } catch (err) {
    console.error("Payroll query error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load payroll data",
      agents: [],
      stats: { totalPayable: 0, totalPaid: 0, totalPending: 0, totalAgents: 0 }
    });
  }
});

module.exports = router;