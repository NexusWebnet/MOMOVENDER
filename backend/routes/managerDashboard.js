// routes/managerDashboard.js
const express = require("express");
const router = express.Router();
const db = require("../config/db"); // your MySQL connection
const bcrypt = require('bcryptjs');

const { authenticateToken } = require("./auth");


router.get('/', authenticateToken, async (req, res) => {
  // Only allow manager & admin
  if (!['manager', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied – Manager/Admin only' });
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. Daily transaction volume
    const [dailyStats] = await req.db.query(`
      SELECT 
        COALESCE(SUM(amount), 0) AS total_volume,
        COALESCE(SUM(CASE WHEN payment_method = 'momo' THEN amount ELSE 0 END), 0) AS momo_volume,
        COUNT(*) AS txn_count
      FROM transactions 
      WHERE DATE(created_at) = ? AND status = 'success'
    `, [today]);

    // 2. Total active agents (employees)
    const [agents] = await req.db.query(`
      SELECT COUNT(*) AS count 
      FROM users 
      WHERE role = 'employee'
    `);

    // 3. Pending withdrawals
    const [pending] = await req.db.query(`
      SELECT COUNT(*) AS count 
      FROM transactions 
      WHERE transaction_type = 'withdraw' AND status = 'pending'
    `);

    // 4. Total float balance across all agents
    const [floatBal] = await req.db.query(`
      SELECT COALESCE(SUM(a.balance), 0) AS total 
      FROM accounts a 
      JOIN users u ON a.user_id = u.id 
      WHERE u.role = 'employee'
    `);

    // 5. Unread notifications for this manager
    const [unreadNotifs] = await req.db.query(`
      SELECT COUNT(*) AS count 
      FROM notifications 
      WHERE receiver_id = ? AND is_read = 0
    `, [req.user.id]);

    // 6. Recent 10 transactions (for live activity feed)
    const [recentTxns] = await req.db.query(`
      SELECT 
        t.amount,
        t.transaction_type,
        t.transaction_type,
        t.payment_method,
        t.momo_network,
        t.bank_name,
        u.username,
        u.first_name,
        u.last_name
      FROM transactions t
      LEFT JOIN users u ON t.sender_id = u.id
      WHERE DATE(t.created_at) = ?
      ORDER BY t.created_at DESC
      LIMIT 10
    `, [today]);

    // Send response
    res.json({
      success: true,
      data: {
        daily_transactions: Number(dailyStats[0]?.total_volume || 0),
        momo_volume: Number(dailyStats[0]?.momo_volume || 0),
        active_agents: Number(agents[0]?.count || 0),
        pending_withdrawals: Number(pending[0]?.count || 0),
        total_float: Number(floatBal[0]?.total || 0),
        unread_notifications: Number(unreadNotifs[0]?.count || 0),
        recent_activity: recentTxns.map(t => ({
          name: t.username 
            ? t.username 
            : `${t.first_name || ''} ${t.last_name || ''}`.trim() || 'Unknown Agent',
          action: `${t.transaction_type || 'transaction'} via ${t.payment_method?.toUpperCase() || 'N/A'}`,
          amount: Number(t.amount || 0).toFixed(2),
          network: t.momo_network || t.bank_name || ''
        }))
      }
    });

  } catch (err) {
    console.error('Manager Dashboard Error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load dashboard data' 
    });
  }
});

module.exports = router;
