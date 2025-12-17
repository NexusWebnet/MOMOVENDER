// backend/routes/adminAgents.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { authenticateToken } = require('./auth');

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ success: false, message: 'Admin access required' });
};

router.use(authenticateToken, isAdmin);

// GET all agents (employees + managers)
router.get('/', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 15;
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();
  const sort = req.query.sort || 'first_name';
  const order = req.query.order || 'asc';

  let whereClause = "WHERE u.role IN ('employee', 'manager')";
  let params = [];

  if (search) {
    whereClause += " AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.phone LIKE ? OR u.username LIKE ?)";
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  const orderBy = order === 'desc' ? 'DESC' : 'ASC';
  const sortField = sort === 'balance' ? 'COALESCE(a.balance, 0)' :
                   sort === 'sales' ? 'COALESCE(daily.sales, 0)' :
                   sort === 'name' ? 'u.first_name' : 'u.phone';

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
      COALESCE(a.balance, 0) AS balance,
      COALESCE(daily.sales, 0) AS today_sales
    FROM users u
    LEFT JOIN branches b ON u.branch_id = b.id
    LEFT JOIN accounts a ON a.user_id = u.id
    LEFT JOIN (
      SELECT agent_id, SUM(amount) AS sales
      FROM (
        SELECT agent_id, amount FROM momo_transactions WHERE DATE(created_at) = CURDATE()
        UNION ALL
        SELECT agent_id, amount FROM bank_transactions WHERE DATE(created_at) = CURDATE()
      ) t GROUP BY agent_id
    ) daily ON daily.agent_id = u.id
    ${whereClause}
    ORDER BY ${sortField} ${orderBy}
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);

  db.query(agentsQuery, params, (err, agents) => {
    if (err) {
      console.error("Agent load error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }

    db.query(`
      SELECT 
        COUNT(*) AS total,
        COALESCE(SUM(a.balance), 0) AS totalFloat
      FROM users u
      LEFT JOIN accounts a ON a.user_id = u.id
      WHERE u.role IN ('employee', 'manager')
    `, (err, statsResult) => {
      if (err) {
        console.error("Agent stats error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
      }

      const stats = statsResult[0];

      res.json({
        success: true,
        data: {
          agents: agents.map(a => ({
            ...a,
            status: 'active'
          })),
          stats: {
            total: parseInt(stats.total || 0),
            active: parseInt(stats.total || 0),
            inactive: 0,
            totalFloat: parseFloat(stats.totalFloat || 0)
          },
          pagination: {
            page,
            limit,
            total: agents.length
          }
        }
      });
    });
  });
});

// GET single agent
router.get('/:id', (req, res) => {
  db.query(
    `SELECT id, first_name, last_name, username, phone, role, branch_id FROM users WHERE id = ? AND role IN ('employee', 'manager')`,
    [req.params.id],
    (err, rows) => {
      if (err) {
        console.error("Agent fetch error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
      }
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: "Agent not found" });
      }
      res.json({ success: true, data: rows[0] });
    }
  );
});

// CREATE agent
router.post('/', (req, res) => {
  const { first_name, last_name, username, phone, password, branch_id, role = 'employee' } = req.body;

  if (!first_name || !last_name || !username || !phone || !password) {
    return res.status(400).json({ success: false, message: "Required fields missing" });
  }

  if (!['employee', 'manager'].includes(role)) {
    return res.status(400).json({ success: false, message: "Invalid role" });
  }

  bcrypt.hash(password, 10, (err, hashed) => {
    if (err) {
      console.error("Password hash error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }

    db.query(
      `INSERT INTO users (first_name, last_name, username, email, phone, password, role, branch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [first_name, last_name, username, `${username}@momo.com`, phone, hashed, role, branch_id || null],
      (err, result) => {
        if (err) {
          console.error("Agent create error:", err);
          if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: "Username or phone already exists" });
          }
          return res.status(500).json({ success: false, message: "Server error" });
        }

        if (role === 'employee') {
          db.query(
            `INSERT INTO accounts (account_number, user_id, balance) VALUES (?, ?, 0.00)`,
            [`ACC${Date.now()}`, result.insertId],
            (err) => {
              if (err) console.error("Account create error:", err);
              res.status(201).json({ success: true, message: "Employee created with account" });
            }
          );
        } else {
          res.status(201).json({ success: true, message: "Manager created" });
        }
      }
    );
  });
});

// UPDATE agent
router.put('/:id', (req, res) => {
  const id = req.params.id;
  const { first_name, last_name, username, phone, password, branch_id, role } = req.body;

  let sql = `UPDATE users SET first_name=?, last_name=?, username=?, phone=?`;
  let params = [first_name, last_name, username, phone];

  if (branch_id !== undefined) {
    sql += `, branch_id=?`;
    params.push(branch_id === '' ? null : branch_id);
  }

  if (role && ['employee', 'manager'].includes(role)) {
    sql += `, role=?`;
    params.push(role);
  }

  if (password && password.trim()) {
    bcrypt.hash(password, 10, (err, hashed) => {
      if (err) {
        console.error("Password hash error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
      }
      sql += `, password=?`;
      params.push(hashed);

      sql += ` WHERE id=?`;
      params.push(id);

      db.query(sql, params, (err, result) => {
        if (err) {
          console.error("Agent update error:", err);
          return res.status(500).json({ success: false, message: "Server error" });
        }
        if (result.affectedRows === 0) {
          return res.status(404).json({ success: false, message: "Agent not found" });
        }
        res.json({ success: true, message: "Agent updated" });
      });
    });
  } else {
    sql += ` WHERE id=?`;
    params.push(id);

    db.query(sql, params, (err, result) => {
      if (err) {
        console.error("Agent update error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: "Agent not found" });
      }
      res.json({ success: true, message: "Agent updated" });
    });
  }
});

// DELETE agent
router.delete('/:id', (req, res) => {
  db.query(`DELETE FROM users WHERE id = ? AND role IN ('employee', 'manager')`, [req.params.id], (err, result) => {
    if (err) {
      console.error("Agent delete error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }
    res.json({ success: true, message: "Agent deleted" });
  });
});

module.exports = router;