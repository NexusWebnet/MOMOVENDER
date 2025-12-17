// backend/routes/susuRoute.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { authenticateToken } = require("./auth");

// Helper to generate unique transaction ID
function generateTxnId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.floor(1000 + Math.random() * 9000);
  return `SUSU${date}${random}`;
}

// POST /api/records/log — Log Susu Contribution
router.post("/log", authenticateToken, (req, res) => {
  const agentId = req.user.id;
  const agentName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Agent';

  const {
    type,
    customer_name,
    customer_phone,
    amount,
    bank_name,        // This is susu_group in DB
    reference = "Susu Contribution"
  } = req.body;

  // Validate required fields
  if (!customer_name || !customer_phone || !amount || !bank_name) {
    return res.json({ 
      status: false, 
      message: "Customer name, phone, amount, and group are required" 
    });
  }

  if (type !== "susu") {
    return res.json({ 
      status: false, 
      message: "Invalid transaction type for susu logger" 
    });
  }

  // Parse amount safely
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.json({ 
      status: false, 
      message: "Invalid amount" 
    });
  }

  const transactionId = generateTxnId();
  const susuGroup = bank_name.trim();  // Map frontend field to DB column

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
    susuGroup,
    reference.trim(),
    agentId,
    agentName
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Susu DB Error:", err);
      return res.json({ 
        status: false, 
        message: err.sqlMessage || "Failed to save contribution" 
      });
    }

    const newContribution = {
      transaction_id: transactionId,
      customer_name: customer_name.trim(),
      customer_phone: customer_phone.trim(),
      amount: parsedAmount,
      susu_group: susuGroup,
      reference: reference.trim(),
      agent_name: agentName,
      created_at: new Date().toISOString()
    };

    // Real-time notification (safe emit)
    const io = req.app.get('socketio');
    if (io) {
      io.emit('newTransaction', {
        ...newContribution,
        service: 'susu',
        type: 'contribution'
      });
      console.log('Emitted new susu contribution');
    }

    // Success response — matches your frontend
    res.json({
      status: true,
      transactionId,
      message: "Susu contribution logged successfully"
    });
  });
});

module.exports = router;