// backend/routes/airtimeTransactionsRoute.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { authenticateToken } = require("./auth");

// GET /api/transactions/airtime — Get airtime history
router.get("/airtime", authenticateToken, (req, res) => {
  const agentId = req.user.id;
  const { start, end } = req.query;

  let sql = `
    SELECT 
      id,
      customer_name,
      customer_phone,
      network,
      amount,
      reference_note,
      created_at
    FROM airtime_logs 
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
      console.error("Airtime history fetch error:", err);
      return res.status(500).json({ 
        success: false, 
        message: "Failed to fetch airtime history" 
      });
    }

    res.json({
      success: true,
      data: results || []
    });
  });
});

// POST /api/transactions/airtime — Log new airtime transaction
router.post("/airtime", authenticateToken, (req, res) => {
  const agentId = req.user.id;
  const agentName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Agent';
  const {
    customer_name,
    customer_phone,
    network,
    amount,
    reference_note = "Airtime Purchase"
  } = req.body;

  if (!customer_name || !customer_phone || !network || !amount) {
    return res.status(400).json({ 
      success: false, 
      message: "Customer name, phone, network, and amount are required" 
    });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ 
      success: false, 
      message: "Invalid amount" 
    });
  }

  const sql = `
    INSERT INTO airtime_logs 
    (customer_name, customer_phone, amount, network, reference_note, employee_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NOW())
  `;

  db.query(sql, [
    customer_name.trim(),
    customer_phone.trim(),
    parsedAmount,
    network.trim(),
    reference_note.trim(),
    agentId
  ], (err, result) => {
    if (err) {
      console.error("Airtime insert error:", err);
      return res.status(500).json({ 
        success: false, 
        message: "Failed to log airtime transaction" 
      });
    }

    const newAirtime = {
      id: result.insertId,
      customer_name: customer_name.trim(),
      customer_phone: customer_phone.trim(),
      network: network.trim(),
      amount: parsedAmount,
      reference_note: reference_note.trim(),
      created_at: new Date().toISOString()
    };

    // Real-time emit
    const io = req.app.get('socketio');
    if (io) {
      io.emit('newTransaction', {
        ...newAirtime,
        service: 'airtime',
        type: 'topup'
      });
    }

    res.json({
      success: true,
      data: newAirtime,
      message: "Airtime transaction logged successfully"
    });
  });
});

module.exports = router;