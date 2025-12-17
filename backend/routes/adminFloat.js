// backend/routes/adminFloat.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('./auth');

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ success: false, message: 'Admin access required' });
};

router.use(authenticateToken, isAdmin);

// GET /api/admin/float — Current floats + stats
router.get('/', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 15;
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();
  const branch = req.query.branch || '';

  let where = "WHERE u.role = 'employee'";
  let params = [];

  if (search) {
    where += " AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.phone LIKE ? OR u.username LIKE ?)";
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  if (branch) {
    where += " AND u.branch_id = ?";
    params.push(branch);
  }

  const sort = req.query.sort || 'balance';
  const order = req.query.order || 'desc';
  const orderBy = order === 'desc' ? 'DESC' : 'ASC';
  const sortField = sort === 'balance' ? 'COALESCE(a.balance, 0)' :
                   sort === 'volume' ? 'COALESCE(today.vol, 0)' : 'u.first_name';

  const queryStr = `
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
      COALESCE(today.vol, 0) AS today_volume
    FROM users u
    LEFT JOIN branches b ON u.branch_id = b.id
    LEFT JOIN accounts a ON a.user_id = u.id
    LEFT JOIN (
      SELECT agent_id, SUM(amount) AS vol
      FROM (
        SELECT agent_id, amount FROM momo_transactions WHERE DATE(created_at) = CURDATE()
        UNION ALL SELECT agent_id, amount FROM bank_transactions WHERE DATE(created_at) = CURDATE()
      ) t GROUP BY agent_id
    ) today ON today.agent_id = u.id
    ${where}
    ORDER BY ${sortField} ${orderBy}
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);

  db.query(queryStr, params, (err, agents) => {
    if (err) {
      console.error("Float agents fetch error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }

    db.query(`
      SELECT 
        COALESCE(SUM(a.balance), 0) AS totalFloat,
        COUNT(*) AS active,
        SUM(CASE WHEN COALESCE(a.balance, 0) < 2000 THEN 1 ELSE 0 END) AS low,
        SUM(CASE WHEN COALESCE(a.balance, 0) < 1000 THEN 1 ELSE 0 END) AS critical
      FROM users u
      LEFT JOIN accounts a ON a.user_id = u.id
      WHERE u.role = 'employee'
    `, (err, statsResult) => {
      if (err) {
        console.error("Float stats error:", err);
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
            totalFloat: parseFloat(stats.totalFloat || 0),
            active: parseInt(stats.active || 0),
            low: parseInt(stats.low || 0),
            critical: parseInt(stats.critical || 0)
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

// GET /api/admin/float/history — Float history logs
router.get('/history', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();
  const from = req.query.from || '';
  const to = req.query.to || '';
  const action = req.query.action || '';

  let where = "WHERE 1=1";
  let params = [];

  if (search) {
    where += " AND (agent_name LIKE ? OR note LIKE ?)";
    const like = `%${search}%`;
    params.push(like, like);
  }
  if (from) {
    where += " AND DATE(created_at) >= ?";
    params.push(from);
  }
  if (to) {
    where += " AND DATE(created_at) <= ?";
    params.push(to);
  }
  if (action) {
    where += " AND action = ?";
    params.push(action);
  }

  const queryStr = `
    SELECT 
      fl.*,
      u.first_name AS admin_first,
      u.last_name AS admin_last
    FROM float_logs fl
    LEFT JOIN users u ON fl.admin_id = u.id
    ${where}
    ORDER BY fl.created_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  db.query(queryStr, params, (err, logs) => {
    if (err) {
      console.error("Float history error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }

    res.json({
      success: true,
      data: logs
    });
  });
});

// POST /api/admin/float/topup — Top-up agent float
router.post('/topup', (req, res) => {
  const { agent_ids, amount, note = '' } = req.body;
  const adminId = req.user.id;
  const adminName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Admin';

  if (!Array.isArray(agent_ids) || agent_ids.length === 0 || !amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid request' });
  }

  const amountNum = parseFloat(amount);
  let processed = 0;
  let errors = 0;
  const total = agent_ids.length;

  agent_ids.forEach(agentId => {
    db.query('SELECT first_name, last_name, branch_id FROM users WHERE id = ?', [agentId], (err, rows) => {
      if (err || rows.length === 0) {
        errors++;
        checkComplete();
        return;
      }

      const agent = rows[0];
      const agentName = `${agent.first_name} ${agent.last_name}`;
      const branchId = agent.branch_id;

      db.query('SELECT name AS branch_name FROM branches WHERE id = ?', [branchId], (err, bRows) => {
        const branchName = bRows && bRows[0] ? bRows[0].branch_name : null;

        db.query('UPDATE accounts SET balance = balance + ? WHERE user_id = ?', [amountNum, agentId], (err) => {
          if (err) {
            console.error("Float topup update error:", err);
            errors++;
          } else {
            db.query(
              `INSERT INTO float_logs (admin_id, admin_name, agent_id, agent_name, branch_id, branch_name, action, amount, note, created_at)
               VALUES (?, ?, ?, ?, ?, ?, 'topup', ?, ?, NOW())`,
              [adminId, adminName, agentId, agentName, branchId, branchName, amountNum, note],
              () => {}
            );

            const io = req.app.get('socketio');
            if (io) {
              io.emit('floatUpdate', { agentId, amount: amountNum, action: 'topup' });
            }

            processed++;
          }
          checkComplete();
        });
      });
    });
  });

  function checkComplete() {
    if (processed + errors === total) {
      res.json({
        success: true,
        message: `Top-up completed: ${processed} successful, ${errors} failed`
      });
    }
  }
});

// POST /api/admin/float/deduct — Deduct agent float
router.post('/deduct', (req, res) => {
  const { agent_ids, amount, note = '' } = req.body;
  const adminId = req.user.id;
  const adminName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Admin';

  if (!Array.isArray(agent_ids) || agent_ids.length === 0 || !amount || amount <= 0 || !note) {
    return res.status(400).json({ success: false, message: 'Invalid request' });
  }

  const amountNum = parseFloat(amount);
  let processed = 0;
  let errors = 0;
  const total = agent_ids.length;

  agent_ids.forEach(agentId => {
    db.query('SELECT balance FROM accounts WHERE user_id = ?', [agentId], (err, rows) => {
      if (err || rows.length === 0 || rows[0].balance < amountNum) {
        errors++;
        checkComplete();
        return;
      }

      db.query('SELECT first_name, last_name, branch_id FROM users WHERE id = ?', [agentId], (err, uRows) => {
        if (err || uRows.length === 0) {
          errors++;
          checkComplete();
          return;
        }

        const agent = uRows[0];
        const agentName = `${agent.first_name} ${agent.last_name}`;
        const branchId = agent.branch_id;

        db.query('SELECT name AS branch_name FROM branches WHERE id = ?', [branchId], (err, bRows) => {
          const branchName = bRows && bRows[0] ? bRows[0].branch_name : null;

          db.query('UPDATE accounts SET balance = balance - ? WHERE user_id = ?', [amountNum, agentId], (err) => {
            if (err) {
              console.error("Float deduct update error:", err);
              errors++;
            } else {
              db.query(
                `INSERT INTO float_logs (admin_id, admin_name, agent_id, agent_name, branch_id, branch_name, action, amount, note, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'deduct', ?, ?, NOW())`,
                [adminId, adminName, agentId, agentName, branchId, branchName, amountNum, note],
                () => {}
              );

              const io = req.app.get('socketio');
              if (io) {
                io.emit('floatUpdate', { agentId, amount: amountNum, action: 'deduct' });
              }

              processed++;
            }
            checkComplete();
          });
        });
      });
    });
  });

  function checkComplete() {
    if (processed + errors === total) {
      res.json({
        success: true,
        message: `Deduction completed: ${processed} successful, ${errors} failed`
      });
    }
  }
});

module.exports = router;