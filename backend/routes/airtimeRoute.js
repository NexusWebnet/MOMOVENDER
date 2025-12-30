// backend/routes/airtimeRoute.js — UPDATED: Bearer Token Auth + Improved Handling
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "fallback_secret";

// Bearer token middleware
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

// Optional: Admin/Employee check
const requireEmployeeOrAdmin = (req, res, next) => {
  const role = (req.user?.role || '').toLowerCase().trim();
  if (['employee', 'manager', 'admin', 'owner', 'superadmin', 'queen'].includes(role)) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Employee or Admin access required' });
};

router.use(authenticateToken);
router.use(requireEmployeeOrAdmin);

// Helper: Promise-based query
const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

// POST /api/airtime/create — Log new airtime purchase
router.post("/create", async (req, res) => {
  const employeeId = req.user.id;
  const employeeName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Agent';

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

  const values = [
    customer_name.trim(),
    customer_phone.trim(),
    network.trim(),
    parsedAmount,
    reference_note.trim(),
    employeeId
  ];

  try {
    const result = await query(sql, values);

    const newAirtime = {
      id: result.insertId,
      customer_name: customer_name.trim(),
      customer_phone: customer_phone.trim(),
      network: network.trim(),
      amount: parsedAmount,
      reference_note: reference_note.trim(),
      employee_id: employeeId,
      employee_name: employeeName,
      created_at: new Date().toISOString()
    };

    // ==========================
    // SOCKET.IO — REAL-TIME EMITS
    // ==========================
    const io = req.app.get('socketio');
    if (io) {

      // Existing live activity feed (KEEP)
      io.emit('newTransaction', {
        ...newAirtime,
        service: 'airtime',
        type: 'topup'
      });

      // NEW: mark agent as active in real-time
      io.emit('agentActivity', {
        agent_id: employeeId,
        role: req.user.role
      });

      console.log("Emitted airtime transaction + agent activity");
    }

    res.json({
      success: true,
      data: newAirtime,
      message: "Airtime purchase logged successfully"
    });
  } catch (err) {
    console.error("Airtime log error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to log airtime purchase"
    });
  }
});

module.exports = router;
