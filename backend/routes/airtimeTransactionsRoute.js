// backend/routes/airtimeTransactionsRoute.js — FINAL, SAFE & REAL-TIME READY (BEARER TOKEN AUTH)

const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "fallback_secret";

/* ============================
   AUTH MIDDLEWARE (Bearer Token)
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
   DB HELPER (Promise-based)
============================ */
const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

/* ============================
   GET AIRTIME TRANSACTIONS
   Employee sees own
   Admin sees all
============================ */
router.get("/", async (req, res) => {
  const { start, end } = req.query;
  const role = (req.user.role || "").toLowerCase();
  const employeeId = req.user.id;

  try {
    let sql = `
      SELECT 
        al.id,
        al.customer_name,
        al.customer_phone,
        al.network,
        al.amount,
        al.reference_note,
        al.employee_id,
        al.created_at,
        CONCAT(u.first_name, ' ', u.last_name) AS employee_name
      FROM airtime_logs al
      LEFT JOIN users u ON u.id = al.employee_id
      WHERE 1=1
    `;

    const params = [];

    if (!["admin", "owner", "superadmin", "queen"].includes(role)) {
      sql += ` AND al.employee_id = ?`;
      params.push(employeeId);
    }

    if (start && end) {
      sql += ` AND DATE(al.created_at) BETWEEN ? AND ?`;
      params.push(start, end);
    }

    sql += ` ORDER BY al.created_at DESC LIMIT 1000`;

    const results = await query(sql, params);

    res.json({
      success: true,
      data: results || []
    });
  } catch (err) {
    console.error("Airtime history fetch error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch airtime history"
    });
  }
});

/* ============================
   POST AIRTIME TRANSACTION
============================ */
router.post("/", async (req, res) => {
  const employeeId = req.user.id;
  const employeeName =
    `${req.user.first_name || ""} ${req.user.last_name || ""}`.trim() ||
    "Agent";

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
      message:
        "Customer name, phone, network, and amount are required"
    });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid amount"
    });
  }

  try {
    const insertSql = `
      INSERT INTO airtime_logs
      (customer_name, customer_phone, network, amount, reference_note, employee_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `;

    const result = await query(insertSql, [
      customer_name.trim(),
      customer_phone.trim(),
      network.trim(),
      parsedAmount,
      reference_note.trim(),
      employeeId
    ]);

    const newAirtime = {
      id: result.insertId,
      customer_name: customer_name.trim(),
      customer_phone: customer_phone.trim(),
      network: network.trim(),
      amount: parsedAmount,
      reference_note: reference_note.trim(),
      employee_id: employeeId,
      employee_name: employeeName,
      created_at: new Date().toISOString(),
      service: "airtime",
      type: "topup",
      scope: "transaction"
    };

    /* ============================
       SOCKET.IO REAL-TIME EMIT
    ============================ */
    const io = req.app.get("socketio");
    if (io) {
      io.emit("newTransaction", newAirtime);
      io.emit("dashboardUpdate", {
        service: "airtime",
        amount: parsedAmount,
        action: "increment"
      });
      console.log("Airtime transaction emitted to dashboard");
    }

    res.json({
      success: true,
      data: newAirtime,
      message: "Airtime transaction logged successfully"
    });
  } catch (err) {
    console.error("Airtime insert error:", err);
    res.status(500).json({
      success: false,
      message: err.sqlMessage || "Failed to log airtime transaction"
    });
  }
});

module.exports = router;