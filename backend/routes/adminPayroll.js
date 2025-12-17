// backend/routes/adminPayroll.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('./auth');

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ success: false, message: 'Admin access required' });
};

router.use(authenticateToken, isAdmin);

// GET /api/payroll/admin — Payroll data with pagination and date range
router.get('/', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 15;
  const offset = (page - 1) * limit;
  const start = req.query.start || '1970-01-01';
  const end = req.query.end || new Date().toISOString().slice(0, 10);

  const commissionQuery = `
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
      UNION ALL
      SELECT 'bank' AS service, agent_id, amount FROM bank_transactions WHERE DATE(created_at) BETWEEN ? AND ?
      UNION ALL
      SELECT 'airtime' AS service, employee_id, amount FROM airtime_logs WHERE DATE(created_at) BETWEEN ? AND ?
      UNION ALL
      SELECT 'sim' AS service, employee_id, amount FROM sim_sales WHERE DATE(created_at) BETWEEN ? AND ?
      UNION ALL
      SELECT 'susu' AS service, agent_id, amount FROM susu_contributions WHERE DATE(created_at) BETWEEN ? AND ?
    ) t ON t.user_id = u.id
    LEFT JOIN commission_rules cr ON cr.branch_id = u.branch_id AND cr.service_type = t.service
    WHERE u.role IN ('employee', 'manager')
    GROUP BY u.id
    ORDER BY earned DESC
    LIMIT ? OFFSET ?
  `;

  const params = [
    start, end,
    start, end,
    start, end,
    start, end,
    start, end,
    limit, offset
  ];

  db.query(commissionQuery, params, (err, earnedRows) => {
    if (err) {
      console.error("Payroll commission query error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    const paidQuery = `
      SELECT employee_id, COALESCE(SUM(amount), 0) AS paid
      FROM payouts 
      WHERE DATE(paid_at) BETWEEN ? AND ? AND status = 'success'
      GROUP BY employee_id
    `;

    db.query(paidQuery, [start, end], (err, paidRows) => {
      if (err) {
        console.error("Payroll paid query error:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }

      const paidMap = {};
      paidRows.forEach(row => {
        paidMap[row.employee_id] = parseFloat(row.paid || 0);
      });

      const agents = earnedRows.map(agent => ({
        id: agent.id,
        first_name: agent.first_name || '',
        last_name: agent.last_name || '',
        username: agent.username || 'unknown',
        role: agent.role,
        branch_name: agent.branch_name || 'No Branch',
        earned: parseFloat(agent.earned || 0),
        paid: paidMap[agent.id] || 0,
        due: parseFloat((agent.earned - (paidMap[agent.id] || 0)).toFixed(2))
      }));

      const totalPayable = agents.reduce((sum, a) => sum + a.earned, 0);
      const totalPaid = agents.reduce((sum, a) => sum + a.paid, 0);
      const dueCount = agents.filter(a => a.due > 0).length;

      res.json({
        success: true,
        data: {
          agents,
          stats: {
            totalPayable: parseFloat(totalPayable.toFixed(2)),
            totalPaid: parseFloat(totalPaid.toFixed(2)),
            pending: parseFloat((totalPayable - totalPaid).toFixed(2)),
            dueCount
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

// POST /api/payroll/admin/pay — Process salary/commission payments
router.post('/pay', (req, res) => {
  const { agent_ids, amount, payout_type = 'commission', method = 'momo', note = '' } = req.body;
  const paidBy = req.user.id;

  if (!Array.isArray(agent_ids) || agent_ids.length === 0 || !amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid payment data' });
  }

  const amountNum = parseFloat(amount);
  let processed = 0;
  let errors = 0;

  const totalAgents = agent_ids.length;

  agent_ids.forEach(agentId => {
    db.query('SELECT first_name, last_name FROM users WHERE id = ?', [agentId], (err, rows) => {
      if (err || rows.length === 0) {
        errors++;
        checkComplete();
        return;
      }

      const agentName = `${rows[0].first_name} ${rows[0].last_name || ''}`.trim();

      db.query(
        `INSERT INTO payouts 
         (employee_id, amount, payout_type, note, paid_by, method, status, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, 'success', NOW())`,
        [agentId, amountNum, payout_type, note || null, paidBy, method],
        (err) => {
          if (err) {
            console.error("Payout insert error:", err);
            errors++;
          } else {
            processed++;

            // Real-time emit
            const io = req.app.get('socketio');
            if (io) {
              io.emit('payrollUpdate', {
                agentId,
                agentName,
                amount: amountNum,
                payout_type,
                method
              });
            }
          }
          checkComplete();
        }
      );
    });
  });

  function checkComplete() {
    if (processed + errors === totalAgents) {
      res.json({
        success: true,
        message: `Payment completed: ${processed} successful, ${errors} failed`
      });
    }
  }
});

module.exports = router;