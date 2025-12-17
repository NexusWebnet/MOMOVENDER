// backend/routes/susuTransactionsRoute.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { authenticateToken } = require("./auth");

// GET /api/transactions/susu — Get Susu contribution history
router.get("/susu", authenticateToken, (req, res) => {
  const agentId = req.user.id;
  const { start, end } = req.query;  // Optional: ?start=2025-12-01&end=2025-12-07

  let sql = `
    SELECT 
      id,
      transaction_id,
      customer_name,
      customer_phone,
      amount,
      susu_group,
      reference,
      agent_name,
      created_at
    FROM susu_contributions 
    WHERE agent_id = ?
  `;

  const params = [agentId];

  // Optional date range filter
  if (start && end) {
    sql += ` AND DATE(created_at) BETWEEN ? AND ?`;
    params.push(start, end);
  }

  sql += ` ORDER BY created_at DESC LIMIT 1000`;  // Prevent huge loads

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error("Susu contributions fetch error:", err);
      return res.status(500).json({ 
        success: false, 
        message: "Failed to fetch susu contributions" 
      });
    }

    res.json({
      success: true,
      data: results || []  // Consistent with other routes
    });
  });
});

// OPTIONAL: POST route for new susu contribution
router.post("/susu", authenticateToken, (req, res) => {
  const agentId = req.user.id;
  const agentName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim();
  const { transaction_id, customer_name, customer_phone, amount, susu_group, reference } = req.body;

  if (!transaction_id || !customer_name || !amount) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  const sql = `
    INSERT INTO susu_contributions 
    (transaction_id, customer_name, customer_phone, amount, susu_group, reference, agent_id, agent_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `;

  db.query(sql, [transaction_id, customer_name, customer_phone, amount, susu_group, reference, agentId, agentName], (err, result) => {
    if (err) {
      console.error("Susu insert error:", err);
      return res.status(500).json({ success: false, message: "Failed to log contribution" });
    }

    const newContribution = {
      id: result.insertId,
      transaction_id,
      customer_name,
      customer_phone,
      amount,
      susu_group,
      reference,
      agent_name: agentName,
      created_at: new Date().toISOString()
    };

    // Real-time emit (safe & working)
    const io = req.app.get('socketio');
    if (io) {
      io.emit('newTransaction', {
        ...newContribution,
        service: 'susu'
      });
      console.log('Emitted newTransaction for susu');
    } else {
      console.warn('Socket.IO not available');
    }

    res.json({ success: true, data: newContribution });
  });
});

module.exports = router;