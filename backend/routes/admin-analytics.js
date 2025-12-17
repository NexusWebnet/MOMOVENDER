// backend/routes/agentRanking.js (or add to admin.js)
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('./auth');

// Optional: Restrict to admin/manager if needed
// const isAdminOrManager = (req, res, next) => {
//   if (['admin', 'manager'].includes(req.user.role)) return next();
//   return res.status(403).json({ success: false, message: 'Access denied' });
// };
// router.use(authenticateToken, isAdminOrManager);
router.use(authenticateToken);

// GET /api/agent-ranking — Top agents by sales volume
router.get('/agent-ranking', async (req, res) => {
  try {
    const { period = 'day', limit = 10 } = req.query;
    const limitNum = Math.max(1, parseInt(limit));

    let startDate = new Date();
    if (period === 'week') {
      startDate.setDate(startDate.getDate() - 6); // Last 7 days including today
    } else if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
      startDate.setDate(startDate.getDate() + 1); // Approximate 30 days
    } else {
      // Day: start of today
      startDate.setHours(0, 0, 0, 0);
    }

    const start = startDate.toISOString().split('T')[0];

    const sql = `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Unknown Agent') AS agent_name,
        COALESCE(SUM(tx.amount), 0) AS total_sales,
        COALESCE(COUNT(tx.amount), 0) AS total_transactions
      FROM users u
      LEFT JOIN (
        SELECT agent_id, amount FROM momo_transactions WHERE DATE(created_at) >= ?
        UNION ALL
        SELECT agent_id, amount FROM bank_transactions WHERE DATE(created_at) >= ?
        UNION ALL
        SELECT employee_id AS agent_id, amount FROM airtime_logs WHERE DATE(created_at) >= ?
        UNION ALL
        SELECT employee_id AS agent_id, amount FROM sim_sales WHERE DATE(created_at) >= ?
        UNION ALL
        SELECT agent_id, amount FROM susu_contributions WHERE DATE(created_at) >= ?
      ) tx ON tx.agent_id = u.id
      WHERE u.role IN ('employee', 'manager')
      GROUP BY u.id
      ORDER BY total_sales DESC
      LIMIT ?
    `;

    db.query(sql, [start, start, start, start, start, limitNum], (err, rows) => {
      if (err) {
        console.error('Agent ranking query error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
      }

      const ranking = rows.map(row => ({
        id: row.id,
        name: row.agent_name.trim(),
        total_sales: parseFloat(row.total_sales || 0),
        total_transactions: parseInt(row.total_transactions || 0)
      }));

      res.json({
        success: true,
        data: ranking,
        period,
        count: ranking.length
      });
    });
  } catch (err) {
    console.error('Agent ranking error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;