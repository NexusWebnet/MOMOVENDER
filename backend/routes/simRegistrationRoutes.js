// backend/routes/simRegistrationsRoute.js — MATCHES FRONTEND PATH & AUTH

const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "fallback_secret";

// Bearer Token Middleware
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

// Optional: Restrict to employees/admins
const requireEmployeeOrAdmin = (req, res, next) => {
  const role = (req.user?.role || "").toLowerCase().trim();
  if (["employee", "manager", "admin", "owner", "superadmin", "queen"].includes(role)) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: "Employee or Admin access required"
  });
};

router.use(authenticateToken);
router.use(requireEmployeeOrAdmin);

// DB Helper
const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => (err ? reject(err) : resolve(results)));
  });

// POST /api/transactions/sim-registration — Log new SIM registration
router.post("/sim-registration", async (req, res) => {
  const employeeId = req.user.id;
  const employeeName = `${req.user.first_name || ""} ${req.user.last_name || ""}`.trim() || "Agent";

  const {
    customer_name,
    customer_phone,
    id_type,
    id_number,
    network,
    reference_note = "SIM Registration"
  } = req.body;

  // Validation
  if (!customer_name || !customer_phone || !id_type || !id_number || !network) {
    return res.status(400).json({
      success: false,
      message: "All fields are required"
    });
  }

  const amount = 5.00; // Fixed fee
  const transactionId = `SIM_${Date.now()}`;

  try {
    const sql = `
      INSERT INTO sim_sales 
        (transaction_id, employee_id, employee_name, customer_name, customer_phone,
         id_type, id_number, network, amount, reference_note, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success', NOW())
    `;
    const values = [
      transactionId,
      employeeId,
      employeeName,
      customer_name.trim(),
      customer_phone.trim(),
      id_type.trim(),
      id_number.trim(),
      network.trim(),
      amount,
      reference_note.trim()
    ];

    await query(sql, values);

    const newRegistration = {
      transaction_id: transactionId,
      employee_id: employeeId,
      employee_name: employeeName,
      customer_name: customer_name.trim(),
      customer_phone: customer_phone.trim(),
      network: network.trim(),
      id_type: id_type.trim(),
      id_number: id_number.trim(),
      amount,
      reference_note: reference_note.trim(),
      status: "success",
      created_at: new Date().toISOString()
    };

    // Real-time emit
    const io = req.app.get("socketio");
    if (io) {
      io.emit("newTransaction", {
        ...newRegistration,
        service: "sim",
        type: "registration"
      });
      console.log("Emitted newTransaction event for SIM Registration");
    }

    res.status(201).json({
      success: true,
      transactionId,
      data: newRegistration,
      message: "SIM registered successfully"
    });
  } catch (err) {
    console.error("SIM Registration Error:", err);
    res.status(500).json({
      success: false,
      message: err.sqlMessage || "Database error"
    });
  }
});

module.exports = router;