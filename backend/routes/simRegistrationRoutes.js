// backend/routes/simTransactionsRoute.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { authenticateToken } = require("./auth");

// GET /api/transactions/sim — Get SIM registration history
router.get("/sim", authenticateToken, (req, res) => {
  const agentId = req.user.id;
  const { start, end } = req.query;

  let sql = `
    SELECT 
      transaction_id,
      customer_name,
      customer_phone,
      network,
      id_type,
      id_number,
      amount,
      reference_note,
      status,
      created_at
    FROM sim_sales 
    WHERE employee_id = ?
  `;

  const params = [agentId];

  if (start && end) {
    sql += ` AND DATE(created_at) BETWEEN ? AND ?`;
    params.push(start, end);
  }

  sql += ` ORDER BY created_at DESC LIMIT 1000`;

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error("SIM registration fetch error:", err);
      return res.status(500).json({ 
        success: false, 
        message: "Failed to fetch SIM registrations" 
      });
    }

    res.json({
      success: true,
      data: results || []
    });
  });
});

// POST /api/transactions/sim — Log new SIM registration
router.post("/sim", authenticateToken, (req, res) => {
  const {
    customer_name,
    customer_phone,
    id_type,
    id_number,
    network,
    reference_note = "SIM Registration"
  } = req.body;

  if (!customer_name || !customer_phone || !id_type || !id_number || !network) {
    return res.status(400).json({
      success: false,
      message: "All fields are required"
    });
  }

  const agentId = req.user.id;
  const agentName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Agent';
  const txnId = `SIM_${Date.now()}`;
  const amount = 5.00;

  const sql = `
    INSERT INTO sim_sales 
    (transaction_id, employee_id, employee_name, customer_name, customer_phone,
     id_type, id_number, network, amount, reference_note, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success', NOW())
  `;

  const values = [
    txnId,
    agentId,
    agentName,
    customer_name.trim(),
    customer_phone.trim(),
    id_type,
    id_number.trim(),
    network,
    amount,
    reference_note.trim()
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("SIM Registration Error:", err);
      return res.status(500).json({
        success: false,
        message: "Database error"
      });
    }

    const newRegistration = {
      transaction_id: txnId,
      customer_name: customer_name.trim(),
      customer_phone: customer_phone.trim(),
      network,
      id_type,
      id_number: id_number.trim(),
      amount,
      reference_note: reference_note.trim(),
      status: 'success',
      created_at: new Date().toISOString()
    };

    // Real-time emit — safe method
    const io = req.app.get('socketio');
    if (io) {
      io.emit("newTransaction", {
        ...newRegistration,
        service: 'sim',
        type: 'registration'
      });
    }

    res.json({
      success: true,
      transactionId: txnId,
      message: "SIM registered successfully"
    });
  });
});

module.exports = router;