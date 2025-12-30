// backend/routes/bankTransactionsRoute.js — FINAL, SAFE & REAL-TIME READY

const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "fallback_secret";

/* ============================
   AUTH MIDDLEWARE
============================ */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "No token provided"
    });
  }

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: "Invalid or expired token"
      });
    }
    req.user = decoded;
    next();
  });
};

const requireEmployeeOrAdmin = (req, res, next) => {
  const role = (req.user?.role || "").toLowerCase().trim();
  if (
    ["employee", "manager", "admin", "owner", "superadmin", "queen"].includes(
      role
    )
  ) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: "Employee or Admin access required"
  });
};

router.use(authenticateToken);
router.use(requireEmployeeOrAdmin);

/* ============================
   DB HELPER
============================ */
const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

/* ============================
   HELPER: Generate Unique Transaction ID
============================ */
function generateTransactionId(type) {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return type === "deposit" ? `BD${timestamp}${random}` : `WD${timestamp}${random}`;
}

/* ============================
   GET /api/transactions/bank
   Fetch bank transactions (deposits & withdrawals)
============================ */
router.get("/", async (req, res) => {
  const agentId = req.user.id;
  const { start, end } = req.query;

  try {
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
      sql += " AND DATE(created_at) BETWEEN ? AND ?";
      params.push(start, end);
    }

    sql += " ORDER BY created_at DESC LIMIT 1000";

    const results = await query(sql, params);

    res.json({ success: true, data: results || [] });
  } catch (err) {
    console.error("Bank transactions fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch bank transactions" });
  }
});

/* ============================
   POST /api/transactions/bank
   Log new bank transaction (deposit or withdrawal)
============================ */
router.post("/", async (req, res) => {
  const agentId = req.user.id;
  const agentName = `${req.user.first_name || ""} ${req.user.last_name || ""}`.trim() || "Agent";

  const {
    customer_name,
    customer_account,
    bank_name,
    amount,
    type, // 'deposit' or 'withdraw'
    reference_note
  } = req.body;

  // Validation
  if (!customer_name || !customer_account || !bank_name || !amount || !type) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields"
    });
  }

  if (!["deposit", "withdraw"].includes(type)) {
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

  const txnReference = reference_note?.trim() || (type === "deposit" ? "Bank Deposit" : "Bank Withdrawal");
  const transactionId = generateTransactionId(type);

  try {
    const sql = `
      INSERT INTO bank_transactions 
      (transaction_id, agent_id, agent_name, customer_name, customer_account, bank_name, amount, type, reference_note, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'success', NOW())
    `;

    const result = await query(sql, [
      transactionId,
      agentId,
      agentName,
      customer_name.trim(),
      customer_account.trim(),
      bank_name.trim(),
      parsedAmount,
      type,
      txnReference
    ]);

    const newTxn = {
      id: result.insertId,
      transaction_id: transactionId,
      agent_id: agentId,
      agent_name: agentName,
      customer_name: customer_name.trim(),
      customer_account: customer_account.trim(),
      bank_name: bank_name.trim(),
      amount: parsedAmount,
      type,
      reference_note: txnReference,
      status: "success",
      created_at: new Date().toISOString()
    };

    /* ============================
       SOCKET.IO REAL-TIME EMIT
    ============================ */
    const io = req.app.get("socketio");
    if (io) {
      io.emit("newTransaction", { ...newTxn, service: "bank" });
      io.emit("dashboardUpdate", {
        service: "bank",
        amount: parsedAmount,
        type
      });
      console.log("Bank transaction emitted to dashboard");
    }

    res.status(201).json({
      success: true,
      message: "Bank transaction logged successfully",
      data: newTxn
    });
  } catch (err) {
    console.error("Bank transaction insert error:", err);
    res.status(500).json({
      success: false,
      message: err.sqlMessage || "Failed to log bank transaction"
    });
  }
});

module.exports = router;
