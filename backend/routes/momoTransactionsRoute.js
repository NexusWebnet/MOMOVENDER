// backend/routes/momoTransactionsRoute.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { authenticateToken } = require("./auth");

// GET /api/transactions/momo - Get MoMo transaction history
router.get("/momo", authenticateToken, (req, res) => {
  const agentId = req.user.id;
  const { start, end } = req.query;  // Optional: ?start=2025-12-01&end=2025-12-07

  let sql = `
    SELECT 
      transaction_id,
      type,
      customer_name,
      customer_phone,
      amount,
      network,
      status,
      momo_reference,
      reference_note,
      created_at
    FROM momo_transactions 
    WHERE agent_id = ?
  `;

  const params = [agentId];

  // Optional date range filter
  if (start && end) {
    sql += ` AND DATE(created_at) BETWEEN ? AND ?`;
    params.push(start, end);
  }

  sql += ` ORDER BY created_at DESC LIMIT 1000`;  // Prevent overload

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error("MoMo transactions fetch error:", err);
      return res.status(500).json({ 
        success: false, 
        message: "Failed to fetch transactions" 
      });
    }

    res.json({
      success: true,
      data: results  // Consistent with other routes
    });
  });
});

// POST /api/transactions/momo - Create new MoMo transaction (example)
// You probably have this in a separate logger route, but here's a safe template
router.post("/momo", authenticateToken, (req, res) => {
  const agentId = req.user.id;
  const agentName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim();
  const {
    customer_name,
    customer_phone,
    amount,
    type,
    network = "MTN",
    momo_reference,
    reference_note
  } = req.body;

  if (!customer_name || !customer_phone || !amount || !type) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  const sql = `
    INSERT INTO momo_transactions 
    (agent_id, agent_name, customer_name, customer_phone, amount, type, network, momo_reference, reference_note, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'success', NOW())
  `;

  db.query(sql, [
    agentId, agentName, customer_name, customer_phone, amount, type, network, momo_reference, reference_note
  ], (err, result) => {
    if (err) {
      console.error("MoMo insert error:", err);
      return res.status(500).json({ success: false, message: "Transaction failed" });
    }

    const newTxn = {
      transaction_id: result.insertId,
      agent_id: agentId,
      agent_name: agentName,
      customer_name,
      customer_phone,
      amount,
      type,
      network,
      momo_reference,
      reference_note,
      status: 'success',
      created_at: new Date().toISOString()
    };

    // FIXED: Safe Socket.IO emit
    const io = req.app.get('socketio');
    if (io) {
      io.emit('newTransaction', {
        ...newTxn,
        service: 'momo'
      });
      console.log('Emitted newTransaction event');
    } else {
      console.warn('Socket.IO not available - event not emitted');
    }

    res.json({ success: true, data: newTxn });
  });
});

module.exports = router;