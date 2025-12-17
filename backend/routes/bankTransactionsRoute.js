// backend/routes/bankTransactionsRoute.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { authenticateToken } = require("./auth");

// GET /api/transactions/bank — Get all bank transactions (deposits & withdrawals)
router.get("/bank", authenticateToken, (req, res) => {
  const agentId = req.user.id;
  const { start, end } = req.query;

  let sql = `
    SELECT 
      id,
      transaction_id,
      customer_name,
      customer_account AS account_number,
      bank_name,
      amount,
      type,
      reference_note AS reference,
      status,
      created_at
    FROM bank_transactions 
    WHERE agent_id = ?
  `;

  const params = [agentId];

  if (start && end) {
    sql += ` AND DATE(created_at) BETWEEN ? AND ?`;
    params.push(start, end);
  }

  sql += ` ORDER BY created_at DESC LIMIT 1000`;

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error("Bank transactions fetch error:", err);
      return res.status(500).json({ 
        success: false, 
        message: "Failed to fetch bank transactions" 
      });
    }

    res.json({
      success: true,
      data: results || []
    });
  });
});

// POST /api/transactions/bank — Log new bank transaction (deposit or withdrawal)
router.post("/bank", authenticateToken, (req, res) => {
  const agentId = req.user.id;
  const agentName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Agent';
  const {
    customer_name,
    customer_account,
    bank_name,
    amount,
    type,  // 'deposit' or 'withdraw'
    reference_note = type === 'deposit' ? 'Bank Deposit' : 'Bank Withdrawal'
  } = req.body;

  if (!customer_name || !customer_account || !bank_name || !amount || !type) {
    return res.status(400).json({ 
      success: false, 
      message: "Missing required fields" 
    });
  }

  if (!['deposit', 'withdraw'].includes(type)) {
    return res.status(400).json({ 
      success: false, 
      message: "Type must be 'deposit' or 'withdraw'" 
    });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ 
      success: false, 
      message: "Invalid amount" 
    });
  }

  const transactionId = type === 'deposit' ? `BD${Date.now()}` : `WD${Date.now()}`;

  const sql = `
    INSERT INTO bank_transactions 
    (transaction_id, agent_id, agent_name, customer_name, customer_account, bank_name, amount, type, reference_note, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'success', NOW())
  `;

  db.query(sql, [
    transactionId,
    agentId,
    agentName,
    customer_name.trim(),
    customer_account.trim(),
    bank_name.trim(),
    parsedAmount,
    type,
    reference_note.trim()
  ], (err, result) => {
    if (err) {
      console.error("Bank transaction insert error:", err);
      return res.status(500).json({ 
        success: false, 
        message: "Failed to log bank transaction" 
      });
    }

    const newTxn = {
      id: result.insertId,
      transaction_id: transactionId,
      customer_name: customer_name.trim(),
      customer_account: customer_account.trim(),
      bank_name: bank_name.trim(),
      amount: parsedAmount,
      type,
      reference_note: reference_note.trim(),
      status: 'success',
      created_at: new Date().toISOString()
    };

    // Real-time emit
    const io = req.app.get('socketio');
    if (io) {
      io.emit('newTransaction', {
        ...newTxn,
        service: 'bank',
        type: type
      });
    }

    res.json({
      success: true,
      data: newTxn,
      message: "Bank transaction logged successfully"
    });
  });
});

module.exports = router;