// routes/admin.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const bcrypt = require('bcryptjs');

// ADMIN ONLY ACCESS
router.use((req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only Admin (Owner) can access this' });
  }
  next();
});

// ADMIN DASHBOARD DATA
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Today's sales
    const [sales] = await req.pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS today_sales
      FROM transactions 
      WHERE DATE(created_at) = ? AND status = 'success'
    `, [today]);

    // Total float in shop
    const [floatData] = await req.pool.query(`
      SELECT COALESCE(SUM(balance), 0) AS total_float 
      FROM accounts
    `);

    // Active agents
    const [agents] = await req.pool.query(`
      SELECT COUNT(*) AS count FROM users WHERE role = 'employee'
    `);

    // Recent 8 transactions
    const [recent] = await req.pool.query(`
      SELECT 
        t.amount, t.transaction_type, t.payment_method, t.created_at,
        CONCAT(u.first_name, ' ', u.last_name) AS agent_name
      FROM transactions t
      LEFT JOIN users u ON t.sender_id = u.id
      ORDER BY t.created_at DESC 
      LIMIT 8
    `);

    res.json({
      today_sales: Number(sales[0].today_sales),
      total_float: Number(floatData[0].total_float),
      active_agents: Number(agents[0].count),
      recent_activity: recent.map(t => ({
        name: t.agent_name || 'Agent',
        action: t.transaction_type,
        amount: Number(t.amount),
        time: new Date(t.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
      }))
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// GET ALL AGENTS
router.get('/agents', async (req, res) => {
  const { search, status } = req.query;

  let query = `
    SELECT u.id, u.first_name, u.last_name, u.username, u.phone, u.status,
           COALESCE(a.balance, 0) AS balance,
           COALESCE(SUM(t.amount), 0) AS today_sales
    FROM users u
    LEFT JOIN accounts a ON a.user_id = u.id
    LEFT JOIN transactions t ON t.sender_id = u.id AND DATE(t.created_at) = CURDATE()
    WHERE u.role = 'employee'
  `;

  const params = [];

  if (search) {
    query += ` AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.phone LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (status) {
    query += ` AND u.status = ?`;
    params.push(status);
  }

  query += ` GROUP BY u.id ORDER BY today_sales DESC`;

  const [agents] = await req.pool.query(query, params);
  res.json(agents);
});

// GET SINGLE AGENT
router.get('/agents/:id', async (req, res) => {
  const [agent] = await req.pool.query(`SELECT * FROM users WHERE id = ? AND role = 'employee'`, [req.params.id]);
  res.json(agent[0]);
});

// ADD/UPDATE AGENT
router.post('/agents', async (req, res) => {
  const { first_name, last_name, username, phone, status, password, id } = req.body;

  if (!password && !id) return res.status(400).json({ error: 'Password required for new agents' });

  try {
    if (id) {
      // Update
      let updateQuery = 'UPDATE users SET first_name = ?, last_name = ?, username = ?, phone = ?, status = ?';
      const updateParams = [first_name, last_name, username, phone, status];
      if (password) {
        const hashed = await bcrypt.hash(password, 10);
        updateQuery += ', password = ?';
        updateParams.push(hashed);
      }
      updateQuery += ' WHERE id = ?';
      updateParams.push(id);
      await req.pool.query(updateQuery, updateParams);
    } else {
      // Add
      const hashed = await bcrypt.hash(password, 10);
      await req.pool.query(`
        INSERT INTO users (first_name, last_name, username, phone, password, status, role)
        VALUES (?, ?, ?, ?, ?, 'active', 'employee')
      `, [first_name, last_name, username, phone, hashed]);

      const [[{ id: newId }]] = await req.pool.query(`SELECT id FROM users WHERE username = ?`, [username]);
      await req.pool.query(`INSERT INTO accounts (account_number, user_id, balance) VALUES (?, ?, 0)`, [`AGENT_${newId}`, newId]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save agent' });
  }
});

// DELETE AGENT
router.delete('/agents/:id', async (req, res) => {
  await req.pool.query(`DELETE FROM users WHERE id = ? AND role = 'employee'`, [req.params.id]);
  res.json({ success: true });
});



// GET FLOAT DATA
router.get('/float', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Total shop float
    const [totalFloat] = await req.pool.query(`
      SELECT COALESCE(SUM(balance), 0) AS total_float 
      FROM accounts
    `);

    // Loaded today
    const [loadedToday] = await req.pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS loaded_today
      FROM transactions 
      WHERE DATE(created_at) = ? AND transaction_type = 'deposit'
    `, [today]);

    // Used today
    const [usedToday] = await req.pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS used_today
      FROM transactions 
      WHERE DATE(created_at) = ? AND transaction_type = 'withdraw'
    `, [today]);

    // Agents with float
    const [agents] = await req.pool.query(`
      SELECT u.id, u.first_name, u.last_name, u.phone,
             COALESCE(a.balance, 0) AS balance,
             COALESCE(SUM(t.amount), 0) AS today_usage
      FROM users u
      LEFT JOIN accounts a ON a.user_id = u.id
      LEFT JOIN transactions t ON t.sender_id = u.id AND DATE(t.created_at) = CURDATE() AND t.transaction_type = 'withdraw'
      WHERE u.role = 'employee'
      GROUP BY u.id
      ORDER BY today_usage DESC
    `);

    // Low float agents (balance < GHS 50k)
    const lowAgents = agents.filter(a => a.balance < 50000);

    res.json({
      total_float: Number(totalFloat[0].total_float),
      loaded_today: Number(loadedToday[0].loaded_today),
      used_today: Number(usedToday[0].used_today),
      agents,
      low_agents: lowAgents
    });
  } catch (err) {
    console.error('Float load error:', err);
    res.status(500).json({ error: 'Failed to load float data' });
  }
});

// TOP-UP AGENT FLOAT
router.post('/float/topup', async (req, res) => {
  const { agent_id, amount, note } = req.body;

  try {
    await req.pool.query(`
      INSERT INTO accounts (account_number, user_id, balance)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)
    `, [`TOPUP_${agent_id}`, agent_id, amount]);

    // Log the top-up
    await req.pool.query(`
      INSERT INTO transactions (sender_id, amount, transaction_type, payment_method, note, status)
      VALUES (?, ?, 'deposit', 'admin', ?, 'success')
    `, [1, amount, note || 'Admin top-up']); // sender_id = 1 for admin

    res.json({ success: true });
  } catch (err) {
    console.error('Top-up error:', err);
    res.status(500).json({ error: 'Failed to top-up' });
  }
});



// GET PAYROLL DATA (Calculate commission from transactions)
router.get('/payroll', async (req, res) => {
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().slice(0,10);

    // Total commission due (1.5% of sales this month)
    const [commissionTotal] = await req.pool.query(`
      SELECT COALESCE(SUM(t.amount) * 0.015, 0) AS total_commission
      FROM transactions t
      JOIN users u ON t.sender_id = u.id
      WHERE DATE(t.created_at) >= ? AND u.role = 'employee'
    `, [monthStartStr]);

    // Paid this month (sum from payouts table)
    const [paidMonth] = await req.pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS paid_this_month
      FROM payouts
      WHERE MONTH(paid_at) = MONTH(CURDATE()) AND YEAR(paid_at) = YEAR(CURDATE())
    `);

    // Agents ready (sales > 0 this month)
    const [readyPay] = await req.pool.query(`
      SELECT COUNT(*) AS count
      FROM users u
      WHERE u.role = 'employee' AND EXISTS (
        SELECT 1 FROM transactions t WHERE t.sender_id = u.id AND DATE(t.created_at) >= ?
      )
    `, [monthStartStr]);

    // Agents with commission/salary
    const [agents] = await req.pool.query(`
      SELECT u.id, u.first_name, u.last_name, u.phone,
             COALESCE(SUM(t.amount), 0) AS month_sales,
             COALESCE(SUM(t.amount) * 0.015, 0) AS commission,
             2000 AS salary  -- Default salary; add column to users if needed
      FROM users u
      LEFT JOIN transactions t ON t.sender_id = u.id AND DATE(t.created_at) >= ?
      WHERE u.role = 'employee'
      GROUP BY u.id
    `, [monthStartStr]);

    // Payout history (from payouts table)
    const [history] = await req.pool.query(`
      SELECT p.*, CONCAT(u.first_name, ' ', u.last_name) AS agent_name
      FROM payouts p
      JOIN users u ON p.employee_id = u.id
      ORDER BY p.paid_at DESC
      LIMIT 50
    `);

    res.json({
      total_commission: Number(commissionTotal[0].total_commission),
      paid_this_month: Number(paidMonth[0].paid_this_month),
      agents_ready: Number(readyPay[0].count),
      agents,
      history
    });
  } catch (err) {
    console.error('Payroll load error:', err);
    res.status(500).json({ error: 'Failed to load payroll data' });
  }
});

// PAY SINGLE AGENT (insert into payouts)
router.post('/payroll/pay', async (req, res) => {
  const { agent_id, amount, type = 'commission', note } = req.body;

  try {
    await req.pool.query(`
      INSERT INTO payouts (employee_id, amount, payout_type, note, paid_by)
      VALUES (?, ?, ?, ?, ?)
    `, [agent_id, amount, type, note || 'Paid by owner', req.user.id]);

    // Optional: Log as transaction for full audit
    await req.pool.query(`
      INSERT INTO transactions (sender_id, receiver_id, amount, transaction_type, payment_method, note, status)
      VALUES (?, ?, ?, 'payout', 'cash', ?, 'success')
    `, [req.user.id, agent_id, amount, note]);

    res.json({ success: true });
  } catch (err) {
    console.error('Pay error:', err);
    res.status(500).json({ error: 'Payment failed' });
  }
});

// BULK PAY ALL COMMISSIONS (insert multiple into payouts)
router.post('/payroll/bulk', async (req, res) => {
  const { note } = req.body;

  try {
    const [agents] = await req.pool.query(`
      SELECT u.id, COALESCE(SUM(t.amount) * 0.015, 0) AS commission
      FROM users u
      LEFT JOIN transactions t ON t.sender_id = u.id AND MONTH(t.created_at) = MONTH(CURDATE())
      WHERE u.role = 'employee'
      GROUP BY u.id
    `);

    let totalPaid = 0;
    for (const agent of agents) {
      if (agent.commission > 0) {
        await req.pool.query(`
          INSERT INTO payouts (employee_id, amount, payout_type, note, paid_by)
          VALUES (?, ?, 'commission', ?, ?)
        `, [agent.id, agent.commission, note || 'Bulk commission', req.user.id]);

        // Log as transaction
        await req.pool.query(`
          INSERT INTO transactions (sender_id, receiver_id, amount, transaction_type, payment_method, note, status)
          VALUES (?, ?, ?, 'payout', 'cash', ?, 'success')
        `, [req.user.id, agent.id, agent.commission, note]);

        totalPaid += agent.commission;
      }
    }

    res.json({ success: true, total_paid: totalPaid });
  } catch (err) {
    console.error('Bulk pay error:', err);
    res.status(500).json({ error: 'Bulk pay failed' });
  }
});


// Example: When admin tops up float, emit to all
router.post('/float/topup', async (req, res) => {
  // ... your top-up code ...
  
  // Emit real-time notification
  emitNotification('float', 'Float topped up', { agent: agentName, amount });
  
  res.json({ success: true });
});

// Example: When admin pays commission
router.post('/payroll/pay', async (req, res) => {
  // ... your pay code ...
  
  emitNotification('payroll', 'Commission paid', { agent: agentName, amount });
  
  res.json({ success: true });
});

module.exports = router;