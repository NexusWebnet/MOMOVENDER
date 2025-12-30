// backend/routes/susuRoute.js — FINAL VERSION (USING EXISTING 'reference' COLUMN)

const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "fallback_secret";

// Bearer Token Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
};

router.use(authenticateToken);

// POST /api/records/log — Log Susu Contribution
router.post("/log", (req, res) => {
  const agentId = req.user.id;
  const agentName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Agent';

  const {
    customer_name,
    customer_phone,
    amount,
    susu_group,
    reference = "Susu Contribution"  // ← Uses the existing 'reference' column
  } = req.body;

  // Validation
  if (!customer_name || !customer_phone || !amount || !susu_group) {
    return res.status(400).json({ 
      success: false, 
      message: "Customer name, phone, amount, and group are required" 
    });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ 
      success: false, 
      message: "Amount must be a positive number" 
    });
  }

  const transactionId = `SUSU_${Date.now()}`;

  const sql = `
    INSERT INTO susu_contributions 
    (transaction_id, customer_name, customer_phone, amount, susu_group, reference, agent_id, agent_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `;

  const values = [
    transactionId,
    customer_name.trim(),
    customer_phone.trim(),
    parsedAmount,
    susu_group.trim(),
    reference.trim(),
    agentId,
    agentName
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Susu Insert Error:", err);
      return res.status(500).json({ 
        success: false, 
        message: "Failed to log contribution" 
      });
    }

    const newContribution = {
      transaction_id: transactionId,
      customer_name: customer_name.trim(),
      customer_phone: customer_phone.trim(),
      amount: parsedAmount,
      susu_group: susu_group.trim(),
      reference: reference.trim(),
      agent_name: agentName,
      created_at: new Date().toISOString()
    };

    // Real-time emit via Socket.IO
    const io = req.app.get('socketio');
    if (io) {
      io.emit('newTransaction', {
        ...newContribution,
        service: 'susu',
        type: 'contribution'
      });
      console.log('Emitted new susu contribution');
    }

    res.json({
      success: true,
      transactionId,
      message: "Susu contribution logged successfully"
    });
  });
});

module.exports = router;