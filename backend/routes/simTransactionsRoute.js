// backend/routes/simTransactionsRoute.js — UPDATED DEC 2025
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "fallback_secret";

// Bearer token middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    req.user = decoded;
    next();
  });
};

// Optional: Employee/Admin check
const requireEmployeeOrAdmin = (req, res, next) => {
  const role = (req.user?.role || '').toLowerCase().trim();
  if (['employee', 'manager', 'admin', 'owner', 'superadmin', 'queen'].includes(role)) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Employee or Admin access required' });
};

// Apply authentication (and optional role check)
router.use(authenticateToken);
// router.use(requireEmployeeOrAdmin); // Uncomment to restrict access

// Helper: Promise-based query
const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

// Helper: Generate unique transaction ID
const generateTxnId = () => `SIM_${Date.now()}`;

// GET /api/transactions/sim — Fetch SIM registration history
router.get('/', async (req, res) => {
  const employeeId = req.user.id;
  const { start, end } = req.query;

  try {
    let sql = `
      SELECT 
        transaction_id,
        customer_name,
        customer_phone,
        network,
        id_type,
        id_number,
        amount,
        reference_note,
        status,
        created_at
      FROM sim_sales
      WHERE employee_id = ?
    `;
    const params = [employeeId];

    if (start && end) {
      sql += ` AND DATE(created_at) BETWEEN ? AND ?`;
      params.push(start, end);
    }

    sql += ` ORDER BY created_at DESC LIMIT 1000`;

    const results = await query(sql, params);
    res.json({ success: true, data: results || [] });
  } catch (err) {
    console.error("SIM registration fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch SIM registrations" });
  }
});




// POST /records/sim — Save SIM registration
router.post('/', async (req, res) => {
  const employeeId = req.user.id;

  const {
    customer_name,
    customer_phone,
    network,
    id_type,
    id_number,
    amount,
    reference_note,
    status
  } = req.body;

  try {
    const sql = `
      INSERT INTO sim_sales (
        employee_id,
        customer_name,
        customer_phone,
        network,
        id_type,
        id_number,
        amount,
        reference_note,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const params = [
      employeeId,
      customer_name,
      customer_phone,
      network,
      id_type,
      id_number,
      amount,
      reference_note,
      status || 'completed'
    ];

    db.query(sql, params, (err, result) => {
      if (err) {
        console.error("SIM registration insert error:", err);
        return res.status(500).json({
          success: false,
          message: "Failed to save SIM registration"
        });
      }

      res.status(201).json({
        success: true,
        message: "SIM registration saved",
        transaction_id: result.insertId
      });
    });

  } catch (err) {
    console.error("SIM registration error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});




// POST /api/transactions/sim — Log new SIM registration
router.post('/', async (req, res) => {
  const employeeId = req.user.id;
  const employeeName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Agent';
  const { customer_name, customer_phone, id_type, id_number, network, reference_note = "SIM Registration" } = req.body;

  if (!customer_name || !customer_phone || !id_type || !id_number || !network) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }

  const amount = 5.00; // fixed SIM registration fee
  const transactionId = generateTxnId();

  try {
    const sql = `
      INSERT INTO sim_sales
        (transaction_id, employee_id, employee_name, customer_name, customer_phone,
         id_type, id_number, network, amount, reference_note, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success', NOW())
    `;
    const values = [
      transactionId, employeeId, employeeName,
      customer_name.trim(), customer_phone.trim(),
      id_type, id_number.trim(), network,
      amount, reference_note.trim()
    ];
    await query(sql, values);

    const newRegistration = {
      transaction_id: transactionId,
      customer_name: customer_name.trim(),
      customer_phone: customer_phone.trim(),
      network,
      id_type,
      id_number: id_number.trim(),
      amount,
      reference_note: reference_note.trim(),
      status: "success",
      created_at: new Date().toISOString()
    };

    // Emit Socket.IO event
    const io = req.app.get('socketio');
    if (io) {
      io.emit('newTransaction', { ...newRegistration, service: 'sim', type: 'registration' });
      console.log("Emitted newTransaction event for SIM Registration");
    }

    res.json({ success: true, transactionId, message: "SIM registered successfully" });
  } catch (err) {
    console.error("SIM Registration Error:", err);
    res.status(500).json({ success: false, message: err.sqlMessage || "Failed to log SIM registration" });
  }
});

module.exports = router;
