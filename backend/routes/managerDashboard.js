// routes/managerDashboard.js — FINAL VERSION (2025 Ready)
const express = require("express");
const router = express.Router();
const db = require("../config/db"); // your mysql2 connection
const { authenticateToken } = require("./auth");

// Helper to run queries with promise
const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
};

// MANAGER DASHBOARD — FULLY CONNECTED TO YOUR DATABASE
router.get('/', authenticateToken, async (req, res) => {
  // Only Manager & Admin
  if (!['manager', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied – Manager/Admin only' });
  }

  const managerId = req.user.id;
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  try {
    // 1. TODAY'S TOTAL TRANSACTIONS (MoMo + Bank)
    const [dailyStats] = await query(`
      SELECT 
        COALESCE(SUM(amount), 0) AS total_volume,
        COUNT(*) AS txn_count
      FROM transactions 
      WHERE DATE(created_at) = ? AND status = 'success'
    `, [today]);

    // 2. MoMo Volume Today (from momo_transactions table)
    const [momoToday] = await query(`
      SELECT COALESCE(SUM(amount), 0) AS momo_volume
      FROM momo_transactions 
      WHERE DATE(created_at) = ?
    `, [today]);

    // 3. Active Agents Today (who made at least one transaction)
    const [activeAgents] = await query(`
      SELECT COUNT(DISTINCT agent_id) AS count
      FROM momo_transactions 
      WHERE DATE(created_at) = ?
    `, [today]);

    // 4. Pending Float Requests (for this manager)
    const [pendingFloat] = await query(`
      SELECT COUNT(*) AS count 
      FROM float_requests 
      WHERE manager_id = ? AND status = 'pending'
    `, [managerId]);

    // 5. Total Float Balance (approved floats for this branch)
    const [floatBalance] = await query(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM float_requests 
      WHERE manager_id = ? AND status = 'approved'
    `, [managerId]);

    // 6. Unread Notifications
    const [unreadNotifs] = await query(`
      SELECT COUNT(*) AS count 
      FROM notifications 
      WHERE receiver_id = ? AND is_read = 0
    `, [managerId]);

    // 7. Live Activity Feed — Last 10 Transactions
    const recentTxns = await query(`
      SELECT 
        m.amount,
        m.type,
        m.network,
        m.created_at,
        u.first_name,
        u.last_name,
        u.username
      FROM momo_transactions m
      JOIN users u ON m.agent_id = u.id
      WHERE DATE(m.created_at) = ?
      ORDER BY m.created_at DESC
      LIMIT 10
    `, [today]);

    const activity = recentTxns.map(t => ({
      name: t.username || `${t.first_name || ''} ${t.last_name || ''}`.trim() || 'Agent',
      action: t.type === 'deposit' ? 'received' : 'sent',
      amount: Number(t.amount).toFixed(2),
      network: t.network || '',
      time: new Date(t.created_at).toLocaleTimeString()
    }));

    // FINAL RESPONSE
    res.json({
      success: true,
      data: {
        daily_transactions: Number(dailyStats[0]?.total_volume || 0),
        momo_volume: Number(momoToday[0]?.momo_volume || 0),
        active_agents: Number(activeAgents[0]?.count || 0),
        pending_withdrawals: Number(pendingFloat[0]?.count || 0),
        total_float: Number(floatBalance[0]?.total || 0),
        unread_notifications: Number(unreadNotifs[0]?.count || 0),
        managerName: `${req.user.first_name} ${req.user.last_name || ''}`.trim(),
        recent_activity: activity
      }
    });

  } catch (err) {
    console.error('Manager Dashboard Error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load dashboard' 
    });
  }
});

module.exports = router;