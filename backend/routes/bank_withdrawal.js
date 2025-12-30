// backend/routes/bank_withdrawal.js — FINAL, SAFE & REAL-TIME READY

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
function generateTransactionId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `WD${timestamp}${random}`;
}

/* ============================
   POST /bank-withdrawal/log
   Log a new bank withdrawal
============================ */
router.post("/log", async (req, res) => {
  const user = req.user;
  const agentId = user.id;
  const agentName =
    `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Unknown Agent";

  const {
    customer_name,
    customer_account,
    bank_name,
    amount,
    reference = "Bank Withdrawal"
  } = req.body;

  // Validation
  if (!customer_name || !customer_account || !bank_name || !amount) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: customer_name, customer_account, bank_name, amount"
    });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid amount"
    });
  }

  const transactionId = generateTransactionId();

  try {
    const sql = `
      INSERT INTO bank_transactions (
        transaction_id,
        agent_id,
        agent_name,
        customer_name,
        customer_account,
        bank_name,
        amount,
        type,
        reference_note,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'withdraw', ?, 'success', NOW())
    `;

    const values = [
      transactionId,
      agentId,
      agentName,
      customer_name.trim(),
      customer_account.trim(),
      bank_name.trim(),
      parsedAmount,
      reference.trim()
    ];

    await query(sql, values);

    const newWithdrawal = {
      transaction_id: transactionId,
      agent_id: agentId,
      agent_name: agentName,
      customer_name: customer_name.trim(),
      customer_account: customer_account.trim(),
      bank_name: bank_name.trim(),
      amount: parsedAmount,
      type: "withdraw",
      reference_note: reference.trim(),
      status: "success",
      created_at: new Date().toISOString(),
      service: "bank",
      scope: "transaction"
    };

    /* ============================
       SOCKET.IO REAL-TIME EMIT
    ============================ */
    const io = req.app.get("socketio");
    if (io) {
      io.emit("newTransaction", newWithdrawal);
      io.emit("dashboardUpdate", {
        service: "bank",
        amount: parsedAmount,
        action: "decrement"
      });
      console.log("Bank withdrawal emitted to dashboard");
    }

    res.status(201).json({
      success: true,
      message: "Bank withdrawal logged successfully",
      transactionId,
      data: newWithdrawal
    });
  } catch (err) {
    console.error("Bank withdrawal error:", err);
    res.status(500).json({
      success: false,
      message: err.sqlMessage || "Failed to save withdrawal"
    });
  }
});

module.exports = router;
