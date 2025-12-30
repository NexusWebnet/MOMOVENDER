// backend/routes/receiptRoutes.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");

// Middleware: check if user is logged in via cookies
function authenticateCookie(req, res, next) {
  const userCookie = req.cookies.user; // assumes 'user' cookie stores user info
  if (!userCookie) {
    return res.status(401).json({ success: false, message: "Not authenticated" });
  }

  try {
    req.user = JSON.parse(userCookie); // store user info in req.user
    next();
  } catch (err) {
    return res.status(400).json({ success: false, message: "Invalid user cookie" });
  }
}

// GET /api/receipts — list last 100 receipts for logged-in agent
router.get("/", authenticateCookie, (req, res) => {
  const agentId = req.user.id;
  const { start, end } = req.query;

  let sql = `SELECT * FROM receipts WHERE employee_id = ?`;
  const params = [agentId];

  if (start && end) {
    sql += ` AND DATE(created_at) BETWEEN ? AND ?`;
    params.push(start, end);
  }

  sql += ` ORDER BY created_at DESC LIMIT 100`;

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error("Receipt fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch receipts" });
    }

    res.json({ success: true, data: results || [] });
  });
});

// GET /api/receipts/:id — fetch single receipt
router.get("/:id", authenticateCookie, (req, res) => {
  const receiptId = req.params.id;

  const sql = `SELECT * FROM receipts WHERE transaction_id = ? LIMIT 1`;
  db.query(sql, [receiptId], (err, results) => {
    if (err) {
      console.error("Receipt fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch receipt" });
    }

    if (!results.length) {
      return res.status(404).json({ success: false, message: "Receipt not found" });
    }

    res.json({ success: true, data: results[0] });
  });
});

// POST /api/receipts — create a new receipt (example: bank withdrawal or sim sale)
router.post("/", authenticateCookie, (req, res) => {
  const { customer_name, customer_phone, account_number, bank_name, amount, reference } = req.body;

  if (!customer_name || !customer_phone || !account_number || !bank_name || !amount) {
    return res.status(400).json({ success: false, message: "All required fields must be filled" });
  }

  const txnId = `REC_${Date.now()}`;
  const agentId = req.user.id;
  const agentName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Agent';

  const sql = `
    INSERT INTO receipts
      (transaction_id, employee_id, employee_name, customer_name, customer_phone, account_number, bank_name, amount, reference, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `;

  const values = [txnId, agentId, agentName, customer_name, customer_phone, account_number, bank_name, amount, reference || ''];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Receipt creation error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    // Emit via socket.io if app has it
    const io = req.app.get('socketio');
    if (io) {
      io.emit("newReceipt", {
        transaction_id: txnId,
        customer_name,
        customer_phone,
        account_number,
        bank_name,
        amount,
        reference,
        agent_name: agentName,
        created_at: new Date().toISOString()
      });
    }

    res.json({ success: true, transactionId: txnId, message: "Receipt created successfully" });
  });
});

module.exports = router;
