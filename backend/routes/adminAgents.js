// backend/routes/adminAgents.js — UPDATED: SAFE EMPTY RESULTS, NO HTML RETURN, FULLY JSON

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'fallback_secret';

/* ===================== AUTH ===================== */
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

router.use(authenticateToken, requireAdmin);

/* Force JSON on every response - prevents HTML 404/500 pages */
router.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

/* ===================== DB HELPER ===================== */
const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) =>
      err ? reject(err) : resolve(results)
    );
  });

/* ===================== GET ALL AGENTS ===================== */
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();

    let whereClause = "WHERE u.role IN ('employee', 'manager')";
    let params = [];

    if (search) {
      whereClause += " AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.phone LIKE ? OR u.username LIKE ?)";
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    const sort = req.query.sort || 'first_name';
    const order = req.query.order?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    let sortField = 'u.first_name';
    if (sort === 'phone') sortField = 'u.phone';
    if (sort === 'username') sortField = 'u.username';
    if (sort === 'balance') sortField = 'COALESCE(a.balance, 0)';
    if (sort === 'sales') sortField = 'COALESCE(daily.sales, 0)';

    const agentsQuery = `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.username,
        u.phone,
        u.role,
        u.branch_id,
        b.name AS branch_name,
        b.location AS branch_location,
        COALESCE(a.balance, 0) AS balance,
        COALESCE(daily.sales, 0) AS today_sales,
        u.is_active
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      LEFT JOIN accounts a ON a.user_id = u.id
      LEFT JOIN (
        SELECT agent_id, SUM(amount) AS sales
        FROM (
          SELECT agent_id, amount FROM momo_transactions WHERE DATE(created_at) = CURDATE()
          UNION ALL SELECT agent_id, amount FROM bank_transactions WHERE DATE(created_at) = CURDATE()
          UNION ALL SELECT employee_id AS agent_id, amount FROM airtime_logs WHERE DATE(created_at) = CURDATE()
          UNION ALL SELECT employee_id AS agent_id, amount FROM sim_sales WHERE DATE(created_at) = CURDATE()
          UNION ALL SELECT agent_id, amount FROM susu_contributions WHERE DATE(created_at) = CURDATE()
        ) t GROUP BY agent_id
      ) daily ON daily.agent_id = u.id
      ${whereClause}
      ORDER BY ${sortField} ${order}
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    const agents = await run(agentsQuery, params) || []; // Safe empty array

    // Stats with real active/inactive
    const statsQuery = `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN u.is_active = 1 THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN u.is_active = 0 THEN 1 ELSE 0 END) AS inactive,
        COALESCE(SUM(a.balance), 0) AS totalFloat
      FROM users u
      LEFT JOIN accounts a ON a.user_id = u.id
      WHERE u.role IN ('employee', 'manager')
    `;
    const [statsRow] = await run(statsQuery) || [{ total: 0, active: 0, inactive: 0, totalFloat: 0 }];

    res.json({
      success: true,
      agents,
      stats: {
        total: parseInt(statsRow.total || 0),
        active: parseInt(statsRow.active || 0),
        inactive: parseInt(statsRow.inactive || 0),
        totalFloat: parseFloat(statsRow.totalFloat || 0)
      }
    });
  } catch (err) {
    console.error('Agents load error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/* ===================== GET SINGLE AGENT ===================== */
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await run(
      `SELECT id, first_name, last_name, username, phone, role, branch_id, is_active 
       FROM users 
       WHERE id = ? AND role IN ('employee', 'manager')`,
      [req.params.id]
    ) || [];

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("Agent fetch error:", err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/* ===================== CREATE AGENT ===================== */
router.post('/', async (req, res) => {
  const { first_name, last_name, username, phone, password, branch_id, role = 'employee' } = req.body;

  if (!first_name || !last_name || !username || !phone || !password) {
    return res.status(400).json({ success: false, message: "Required fields missing" });
  }

  const normalizedRole = role.toLowerCase();
  if (!['employee', 'manager'].includes(normalizedRole)) {
    return res.status(400).json({ success: false, message: "Invalid role" });
  }

  try {
    const hashed = await bcrypt.hash(password, 10);

    const [result] = await run(
      `INSERT INTO users (first_name, last_name, username, email, phone, password, role, branch_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [first_name, last_name, username, `${username}@momo.com`, phone, hashed, normalizedRole, branch_id || null]
    ) || [];

    if (normalizedRole === 'employee') {
      await run(
        `INSERT INTO accounts (account_number, user_id, balance) VALUES (?, ?, 0.00)`,
        [`ACC${Date.now()}`, result.insertId]
      );
    }

    res.status(201).json({ success: true, message: "Agent created successfully" });
  } catch (err) {
    console.error("Create error:", err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: "Username or phone already exists" });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/* ===================== UPDATE AGENT ===================== */
router.put('/:id', async (req, res) => {
  const { first_name, last_name, username, phone, password, branch_id, role } = req.body;
  const id = req.params.id;

  try {
    let sql = `UPDATE users SET first_name = ?, last_name = ?, username = ?, phone = ?`;
    let params = [first_name, last_name, username, phone];

    if (branch_id !== undefined) {
      sql += `, branch_id = ?`;
      params.push(branch_id === '' ? null : branch_id);
    }

    if (role) {
      const normalized = role.toLowerCase();
      if (['employee', 'manager'].includes(normalized)) {
        sql += `, role = ?`;
        params.push(normalized);
      }
    }

    if (password && password.trim()) {
      const hashed = await bcrypt.hash(password, 10);
      sql += `, password = ?`;
      params.push(hashed);
    }

    sql += ` WHERE id = ?`;
    params.push(id);

    const [result] = await run(sql, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    res.json({ success: true, message: "Agent updated" });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/* ===================== DELETE AGENT ===================== */
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await run(
      `DELETE FROM users WHERE id = ? AND role IN ('employee', 'manager')`,
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    res.json({ success: true, message: "Agent deleted" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;