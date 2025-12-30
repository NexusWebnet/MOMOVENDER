// backend/routes/adminFloat.js — FINAL FULL FIXED VERSION

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'fallback_secret';

/* AUTH MIDDLEWARE */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    req.user = decoded;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });

  const role = (req.user.role || '').toLowerCase().trim();
  if (!['admin', 'owner', 'superadmin', 'queen'].includes(role)) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

router.use(authenticateToken, requireAdmin);
router.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

/* DB HELPER */
const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) {
        console.error('SQL ERROR:', err.sqlMessage || err);
        return reject(err);
      }
      resolve(results || []);
    });
  });

/* GET /api/admin/float */
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit) || 15));
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    const branch = req.query.branch || '';
    const sort = ['balance', 'volume', 'name'].includes(req.query.sort) ? req.query.sort : 'balance';
    const order = req.query.order?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    let whereClause = "WHERE u.role IN ('employee', 'manager')";
    let params = [];

    if (search) {
      whereClause += " AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.phone LIKE ? OR u.username LIKE ?)";
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    if (branch) {
      whereClause += " AND u.branch_id = ?";
      params.push(branch);
    }

    const sortField = sort === 'volume' ? 'COALESCE(daily.vol, 0)' :
                     sort === 'balance' ? 'COALESCE(a.balance, 0)' :
                     'u.first_name';

    const agentsQuery = `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.username,
        u.role,
        b.name AS branch_name,
        b.location AS branch_location,
        COALESCE(a.balance, 0) AS balance,
        COALESCE(daily.vol, 0) AS today_volume,
        u.is_active
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      LEFT JOIN accounts a ON a.user_id = u.id
      LEFT JOIN (
        SELECT agent_id, SUM(amount) AS vol
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

    const agents = await run(agentsQuery, params);

    const statsQuery = `
      SELECT 
        COALESCE(SUM(a.balance), 0) AS totalFloat,
        COUNT(*) AS totalAgents,
        SUM(CASE WHEN u.is_active = 1 THEN 1 ELSE 0 END) AS active,
        COUNT(CASE WHEN COALESCE(a.balance, 0) < 2000 THEN 1 END) AS low,
        COUNT(CASE WHEN COALESCE(a.balance, 0) < 1000 THEN 1 END) AS critical
      FROM users u
      LEFT JOIN accounts a ON a.user_id = u.id
      WHERE u.role IN ('employee', 'manager')
    `;
    const [statsRow] = await run(statsQuery);

    res.json({
      success: true,
      agents,
      stats: {
        totalFloat: Number(statsRow.totalFloat || 0),
        totalAgents: Number(statsRow.totalAgents || 0),
        active: Number(statsRow.active || 0),
        low: Number(statsRow.low || 0),
        critical: Number(statsRow.critical || 0)
      }
    });
  } catch (err) {
    console.error('Float list error:', err);
    res.status(500).json({ success: false, message: 'Server error', agents: [], stats: { totalFloat: 0, totalAgents: 0, active: 0, low: 0, critical: 0 } });
  }
});

/* POST /api/admin/float/topup — FULLY SAFE */
router.post('/topup', async (req, res) => {
  const { agents, amount, note = '' } = req.body;

  const adminId = req.user?.id || null;
  const adminName = req.user ? `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Admin' : 'Admin';

  if (!Array.isArray(agents) || agents.length === 0 || !amount || isNaN(amount) || Number(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid agents or amount' });
  }

  const amountNum = parseFloat(amount);
  let successCount = 0;
  let failCount = 0;

  try {
    for (const agentId of agents) {
      try {
        const [userRows] = await run('SELECT first_name, last_name, branch_id FROM users WHERE id = ? AND role IN ("employee","manager")', [agentId]);
        if (userRows.length === 0) {
          failCount++;
          continue;
        }

        const agent = userRows[0];
        const agentName = `${agent.first_name} ${agent.last_name || ''}`.trim();
        const branchId = agent.branch_id || null;

        const [branchRows] = await run('SELECT name AS branch_name FROM branches WHERE id = ?', [branchId]);
        const branchName = branchRows.length > 0 ? branchRows[0].branch_name : null;

        const [accountCheck] = await run('SELECT 1 FROM accounts WHERE user_id = ?', [agentId]);
        if (accountCheck.length === 0) {
          await run('INSERT INTO accounts (user_id, balance) VALUES (?, 0)', [agentId]);
        }

        await run('UPDATE accounts SET balance = balance + ? WHERE user_id = ?', [amountNum, agentId]);

        await run(`
          INSERT INTO float_logs 
          (admin_id, admin_name, agent_id, agent_name, branch_id, branch_name, action, amount, note, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'topup', ?, ?, NOW())
        `, [adminId, adminName, agentId, agentName, branchId, branchName, amountNum, note]);

        successCount++;
      } catch (agentErr) {
        console.error(`Topup failed for agent ${agentId}:`, agentErr);
        failCount++;
      }
    }

    const message = successCount === agents.length 
      ? 'All top-ups successful' 
      : `Top-up complete: ${successCount} successful, ${failCount} failed`;

    res.json({ success: true, message });
  } catch (err) {
    console.error('Bulk topup error:', err);
    res.status(500).json({ success: false, message: 'Server error during topup' });
  }
});

/* POST /api/admin/float/deduct — FULLY SAFE */
router.post('/deduct', async (req, res) => {
  const { agents, amount, note = '' } = req.body;

  const adminId = req.user?.id || null;
  const adminName = req.user ? `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Admin' : 'Admin';

  if (!Array.isArray(agents) || agents.length === 0 || !amount || isNaN(amount) || Number(amount) <= 0 || !note.trim()) {
    return res.status(400).json({ success: false, message: 'Invalid request: amount and reason required' });
  }

  const amountNum = parseFloat(amount);
  let successCount = 0;
  let failCount = 0;

  try {
    for (const agentId of agents) {
      try {
        const [balanceRows] = await run('SELECT balance FROM accounts WHERE user_id = ?', [agentId]);
        if (balanceRows.length === 0 || balanceRows[0].balance < amountNum) {
          failCount++;
          continue;
        }

        const [userRows] = await run('SELECT first_name, last_name, branch_id FROM users WHERE id = ?', [agentId]);
        if (userRows.length === 0) {
          failCount++;
          continue;
        }

        const agent = userRows[0];
        const agentName = `${agent.first_name} ${agent.last_name || ''}`.trim();
        const branchId = agent.branch_id || null;

        const [branchRows] = await run('SELECT name AS branch_name FROM branches WHERE id = ?', [branchId]);
        const branchName = branchRows.length > 0 ? branchRows[0].branch_name : null;

        await run('UPDATE accounts SET balance = balance - ? WHERE user_id = ?', [amountNum, agentId]);

        await run(`
          INSERT INTO float_logs 
          (admin_id, admin_name, agent_id, agent_name, branch_id, branch_name, action, amount, note, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'deduct', ?, ?, NOW())
        `, [adminId, adminName, agentId, agentName, branchId, branchName, amountNum, note]);

        successCount++;
      } catch (agentErr) {
        console.error(`Deduct failed for agent ${agentId}:`, agentErr);
        failCount++;
      }
    }

    const message = successCount === agents.length 
      ? 'All deductions successful' 
      : `Deduction complete: ${successCount} successful, ${failCount} failed`;

    res.json({ success: true, message });
  } catch (err) {
    console.error('Bulk deduct error:', err);
    res.status(500).json({ success: false, message: 'Server error during deduction' });
  }
});

module.exports = router;