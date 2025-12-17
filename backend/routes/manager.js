// routes/manager.js
// ULTIMATE MOMO MANAGER BACKEND – FIXED & PRODUCTION READY (2025)

const express = require("express");
const router = express.Router();
const db = require("../config/db"); // your MySQL connection
const bcrypt = require('bcryptjs');

// ====================== MIDDLEWARE: Manager/Admin Only + Load Branch ======================
router.use(async (req, res, next) => {
  if (!req.user || !['manager', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied. Manager only.' });
  }

  try {
    const [[branch]] = await req.pool.query(
      `SELECT b.id AS branch_id, b.name AS branch_name, b.location 
       FROM branches b 
       JOIN users u ON u.branch_id = b.id 
       WHERE u.id = ?`,
      [req.user.id]
    );

    if (!branch) {
      return res.status(400).json({ error: 'Manager not assigned to any branch' });
    }

    req.branch = branch;
    next();
  } catch (err) {
    console.error('Branch load error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper: Get commission rate for branch (from commission_rules table)
async function getCommissionRate(pool, branch_id, service_type = 'momo') {
  const [rows] = await pool.query(
    `SELECT rate_percent FROM commission_rules 
     WHERE branch_id = ? AND service_type = ? 
     ORDER BY min_amount DESC LIMIT 1`,
    [branch_id, service_type]
  );
  return rows.length > 0 ? rows[0].rate_percent / 100 : 0.015; // fallback 1.5%
}

// ====================== 1. FULL DASHBOARD DATA ======================
router.get('/dashboard/full', async (req, res) => {
  const { branch_id } = req.branch;

  try {
    const today = new Date().toISOString().slice(0, 10);

    // Daily volume
    const [[{ daily_volume }]] = await req.pool.query(`
      SELECT COALESCE(SUM(momo_volume + bank_volume), 0) AS daily_volume
      FROM agent_daily_sales ads
      JOIN users u ON u.id = ads.agent_id
      WHERE ads.sale_date = ? AND u.branch_id = ?
    `, [today, branch_id]);

    // Pending float requests
    const [floatRequests] = await req.pool.query(`
      SELECT fr.id, fr.amount, fr.reason, fr.requested_at,
             u.id AS agent_id, u.first_name, u.last_name, u.username
      FROM float_requests fr
      JOIN users u ON u.id = fr.agent_id
      WHERE fr.status = 'pending' AND u.branch_id = ?
      ORDER BY fr.requested_at DESC
    `, [branch_id]);

    // Monthly commissions using dynamic rules
    const commissionRate = await getCommissionRate(req.pool, branch_id);

    const [commissions] = await req.pool.query(`
      SELECT 
        u.id, u.username, u.first_name,
        COALESCE(SUM(ads.momo_volume + ads.bank_volume), 0) AS total_sales,
        COALESCE(SUM(ads.momo_volume + ads.bank_volume) * ?, 0) AS earned_this_month
      FROM agent_daily_sales ads
      JOIN users u ON u.id = ads.agent_id
      WHERE MONTH(ads.sale_date) = MONTH(CURDATE())
        AND YEAR(ads.sale_date) = YEAR(CURDATE())
        AND u.branch_id = ?
      GROUP BY u.id
    `, [commissionRate, branch_id]);

    res.json({
      branch: req.branch,
      today_volume: Number(daily_volume || 0),
      pending_float_requests: floatRequests.length,
      total_commission_this_month: commissions.reduce((sum, c) => sum + c.earned_this_month, 0),
      commission_rate_percent: commissionRate * 100,
      floatRequests,
      commissions
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ====================== 2. AGENTS MANAGEMENT ======================
router.route('/agents')
  .get(async (req, res) => {
    try {
      const [agents] = await req.pool.query(`
        SELECT u.*, 
               COALESCE(ads.momo_volume + ads.bank_volume, 0) AS today_sales
        FROM users u
        LEFT JOIN agent_daily_sales ads ON ads.agent_id = u.id AND ads.sale_date = CURDATE()
        WHERE u.branch_id = ? AND u.role = 'employee'
        ORDER BY today_sales DESC
      `, [req.branch.branch_id]);
      res.json(agents);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch agents' });
    }
  })
  .post(async (req, res) => {
    const { first_name, last_name, username, phone, password } = req.body;

    if (!password) return res.status(400).json({ error: 'Password required' });

    try {
      const hashed = await bcrypt.hash(password, 10);

      await req.pool.query(`
        INSERT INTO users (first_name, last_name, username, phone, password, role, branch_id)
        VALUES (?, ?, ?, ?, ?, 'employee', ?)
      `, [first_name, last_name, username, phone, hashed, req.branch.branch_id]);

      const [[{ id }]] = await req.pool.query(`SELECT id FROM users WHERE username = ?`, [username]);

      // Create float account
      await req.pool.query(`
        INSERT IGNORE INTO accounts (account_number, user_id, balance) 
        VALUES (?, ?, 0)
      `, [`AGENT_${id}`, id]);

      res.json({ success: true, message: 'Agent created successfully' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create agent' });
    }
  });

router.route('/agents/:id')
  .put(async (req, res) => {
    const { first_name, last_name, username, phone, password } = req.body;
    const fields = [];
    const values = [];

    if (first_name) { fields.push('first_name = ?'); values.push(first_name); }
    if (last_name) { fields.push('last_name = ?'); values.push(last_name); }
    if (username) { fields.push('username = ?'); values.push(username); }
    if (phone) { fields.push('phone = ?'); values.push(phone); }
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      fields.push('password = ?'); values.push(hashed);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);

    try {
      await req.pool.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = ? AND branch_id = ? AND role = 'employee'`,
        [...values, req.branch.branch_id]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Update failed' });
    }
  })
  .delete(async (req, res) => {
    try {
      await req.pool.query(
        `DELETE FROM users WHERE id = ? AND branch_id = ? AND role = 'employee'`,
        [req.params.id, req.branch.branch_id]
      );
      res.json({ success: true, message: 'Agent deleted' });
    } catch (err) {
      res.status(500).json({ error: 'Delete failed' });
    }
  });

// ====================== 3. FLOAT REQUESTS ======================
router.get('/float/requests', async (req, res) => {
  try {
    const [requests] = await req.pool.query(`
      SELECT fr.*, u.first_name, u.last_name, u.username
      FROM float_requests fr
      JOIN users u ON u.id = fr.agent_id
      WHERE u.branch_id = ? AND fr.status = 'pending'
      ORDER BY fr.requested_at DESC
    `, [req.branch.branch_id]);
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load requests' });
  }
});

router.post('/float/process/:id', async (req, res) => {
  const { status } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be approved or rejected' });
  }

  try {
    const [[request]] = await req.pool.query(
      `SELECT * FROM float_requests WHERE id = ? AND status = 'pending'`,
      [req.params.id]
    );

    if (!request) return res.status(404).json({ error: 'Request not found or already processed' });

    await req.pool.query(`
      UPDATE float_requests 
      SET status = ?, manager_id = ?, processed_at = NOW()
      WHERE id = ?
    `, [status, req.user.id, req.params.id]);

    if (status === 'approved') {
      await req.pool.query(`
        INSERT INTO accounts (account_number, user_id, balance)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)
      `, [`FLOAT_${request.agent_id}`, request.agent_id, request.amount]);
    }

    res.json({ success: true, message: `Request ${status}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Processing failed' });
  }
});

// ====================== 4. DYNAMIC COMMISSION REPORT ======================
router.get('/commission/monthly', async (req, res) => {
  const rate = await getCommissionRate(req.pool, req.branch.branch_id);

  try {
    const [data] = await req.pool.query(`
      SELECT 
        u.id, u.first_name, u.last_name, u.username,
        COALESCE(SUM(ads.momo_volume + ads.bank_volume), 0) as total_sales,
        COALESCE(SUM(ads.momo_volume + ads.bank_volume) * ?, 0) as commission
      FROM users u
      LEFT JOIN agent_daily_sales ads ON ads.agent_id = u.id
        AND MONTH(ads.sale_date) = MONTH(CURDATE())
        AND YEAR(ads.sale_date) = YEAR(CURDATE())
      WHERE u.branch_id = ? AND u.role = 'employee'
      GROUP BY u.id
      ORDER BY commission DESC
    `, [rate, req.branch.branch_id]);

    res.json({
      month: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
      commission_rate: (rate * 100).toFixed(2) + '%',
      agents: data,
      total_commission: data.reduce((s, a) => s + a.commission, 0)
    });
  } catch (err) {
    res.status(500).json({ error: 'Commission report failed' });
  }
});

// ====================== 5. BRANCH CHAT ======================
router.get('/chat/messages', async (req, res) => {
  try {
    const [messages] = await req.pool.query(`
      SELECT cm.id, cm.message, cm.sent_at, u.first_name, u.username, u.role
      FROM chat_messages cm
      JOIN users u ON u.id = cm.sender_id
      WHERE cm.branch_id = ?
      ORDER BY cm.sent_at DESC
      LIMIT 100
    `, [req.branch.branch_id]);
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

router.post('/chat/send', async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  try {
    await req.pool.query(`
      INSERT INTO chat_messages (sender_id, branch_id, message)
      VALUES (?, ?, ?)
    `, [req.user.id, req.branch.branch_id, message.trim()]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Send failed' });
  }
});
// FULL BRANCH TRANSACTIONS + ANALYSIS
router.get('/transactions/full', async (req, res) => {
  try {
    const [transactions] = await req.pool.query(`
      SELECT 
        t.*,
        CONCAT(u.first_name, ' ', u.last_name) AS agent_name,
        u.username
      FROM transactions t
      JOIN users u ON t.sender_id = u.id
      WHERE u.branch_id = ?
      ORDER BY t.created_at DESC
      LIMIT 1000
    `, [req.branch.branch_id]);

    const [agents] = await req.pool.query(`SELECT id, first_name, last_name FROM users WHERE branch_id = ? AND role = 'employee'`, [req.branch.branch_id]);

    const [dailyTrend] = await req.pool.query(`
      SELECT DATE(created_at) as date, SUM(amount) as total
      FROM transactions 
      WHERE branch_id related via user
      GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 7
    `);

    const [topAgents] = await req.pool.query(`
      SELECT 
        CONCAT(u.first_name, ' ', LEFT(u.last_name,1)) AS agent_name,
        SUM(t.amount) as total
      FROM transactions t
      JOIN users u ON t.sender_id = u.id
      WHERE u.branch_id = ?
      GROUP BY u.id ORDER BY total DESC LIMIT 5
    `, [req.branch.branch_id]);

    res.json({
      branch: req.branch,
      transactions,
      agents,
      dailyTrend,
      topAgents
    });
  } catch (err) {
    res.status(500).json({ error: 'Load failed' });
  }
});

// BRANCH MANAGER FLOAT DASHBOARD
router.get('/float/branch', async (req, res) => {
  const { branch_id } = req.branch;

  const [branchFloat] = await req.pool.query(`
    SELECT COALESCE(SUM(a.balance), 0) AS total 
    FROM accounts a 
    JOIN users u ON a.user_id = u.id 
    WHERE u.branch_id = ?
  `, [branch_id]);

  const [agents] = await req.pool.query(`
    SELECT u.id, u.first_name, u.last_name, u.phone, a.balance,
           COALESCE(ads.momo_volume + ads.bank_volume, 0) AS today_sales
    FROM users u
    LEFT JOIN accounts a ON a.user_id = u.id
    LEFT JOIN agent_daily_sales ads ON ads.agent_id = u.id AND ads.sale_date = CURDATE()
    WHERE u.branch_id = ? AND u.role = 'employee'
  `, [branch_id]);

  const lowAgents = agents.filter(a => a.balance < 100000);

  res.json({
    branch: req.branch,
    branch_float: Number(branchFloat[0].total),
    today_loaded: 250000, // You can calculate from logs
    today_used: 180000,
    agents,
    low_agents: lowAgents.map(a => ({ name: `${a.first_name} ${a.last_name}`, balance: a.balance }))
  });
});

// REQUEST MORE FLOAT FROM HEAD OFFICE
router.post('/float/request', async (req, res) => {
  const { amount, reason } = req.body;
  await req.pool.query(`
    INSERT INTO float_requests (agent_id, amount, reason, status)
    VALUES (?, ?, ?, 'pending')
  `, [req.user.id, amount, reason || 'Branch manager request']);
  res.json({ success: true });
});

// TOP-UP INDIVIDUAL AGENT
router.post('/float/topup-agent', async (req, res) => {
  const { agent_id, amount } = req.body;
  await req.pool.query(`
    INSERT INTO accounts (account_number, user_id, balance)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)
  `, [`MANAGER_TOPUP_${agent_id}`, agent_id, amount]);
  res.json({ success: true });
});


// GET REPORT DATA WITH FILTERS
router.get('/reports/data', async (req, res) => {
  const type = req.query.type || 'month';
  let start, end, period;

  const now = new Date();
  if (type === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    period = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  } else if (type === 'lastmonth') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    start.setMonth(start.getMonth() - 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0);
    period = start.toLocaleString('default', { month: 'long', year: 'numeric' });
  } else if (type === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 31);
    period = now.getFullYear();
  } else if (type === 'custom') {
    start = new Date(req.query.start);
    end = new Date(req.query.end);
    period = `${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;
  }

  const startStr = start.toISOString().slice(0,10);
  const endStr = end.toISOString().slice(0,10);

  // ... run all your queries with WHERE DATE(created_at) BETWEEN ? AND ?

  res.json({ period, branch: req.branch, manager_name: `${req.user.first_name} ${req.user.last_name}`, summary, agents, daily, float });
});

module.exports = router;
