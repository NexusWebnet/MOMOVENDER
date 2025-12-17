// backend/routes/airtimeRoute.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { authenticateToken } = require("./auth");

// POST /airtime/create — Log new airtime purchase
router.post("/create", authenticateToken, (req, res) => {
  const employee_id = req.user.id;
  const employee_name = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Agent';

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
    (customer_name, customer_phone, network, amount, reference_note, employee_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NOW())
  `;

  db.query(sql, [
    customer_name.trim(),
    customer_phone.trim(),
    network.trim(),
    parsedAmount,
    reference_note.trim(),
    employee_id
  ], (err, result) => {
    if (err) {
      console.error("Airtime log error:", err);
      return res.status(500).json({ 
        success: false, 
        message: "Failed to log airtime purchase" 
      });
    }

    const newAirtime = {
      id: result.insertId,
      customer_name: customer_name.trim(),
      customer_phone: customer_phone.trim(),
      network: network.trim(),
      amount: parsedAmount,
      reference_note: reference_note.trim(),
      employee_id,
      employee_name,
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
      message: "Airtime purchase logged successfully"
    });
  });
});

module.exports = router;