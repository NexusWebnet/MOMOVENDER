// backend/routes/susuTransactionsRoute.js — UPDATED DEC 2025
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

// Helper to generate unique transaction ID
const generateTxnId = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.floor(1000 + Math.random() * 9000);
  return `SUSU${date}${random}`;
};

// GET /api/transactions/susu — Fetch Susu contributions (optional date filter)
router.get('/', async (req, res) => {
  const agentId = req.user.id;
  const { start, end } = req.query;

  try {
    let sql = `
      SELECT 
        transaction_id,
        customer_name,
        customer_phone,
        amount,
        susu_group,
        reference,
        agent_name,
        created_at
      FROM susu_contributions
      WHERE agent_id = ?
    `;
    const params = [agentId];

    if (start && end) {
      sql += ` AND DATE(created_at) BETWEEN ? AND ?`;
      params.push(start, end);
    }

    sql += ` ORDER BY created_at DESC LIMIT 1000`;

    const results = await query(sql, params);
    res.json({ success: true, data: results || [] });
  } catch (err) {
    console.error("Susu contributions fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch susu contributions" });
  }
});

// POST /api/transactions/susu — Log new Susu contribution
router.post('/', async (req, res) => {
  const agentId = req.user.id;
  const agentName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Agent';
  const { customer_name, customer_phone, amount, susu_group, reference = "Susu Contribution" } = req.body;

  if (!customer_name || !customer_phone || !amount || !susu_group) {
    return res.status(400).json({ success: false, message: "Customer name, phone, amount, and group are required" });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ success: false, message: "Invalid amount" });
  }

  const transactionId = generateTxnId();

  try {
    const sql = `
      INSERT INTO susu_contributions 
        (transaction_id, customer_name, customer_phone, amount, susu_group, reference, agent_id, agent_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const values = [transactionId, customer_name.trim(), customer_phone.trim(), parsedAmount, susu_group.trim(), reference.trim(), agentId, agentName];
    await query(sql, values);

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

    // Emit Socket.IO event
    const io = req.app.get('socketio');
    if (io) {
      io.emit('newTransaction', { ...newContribution, service: 'susu', type: 'contribution' });
      console.log('Emitted newTransaction event for Susu');
    }

    res.json({ success: true, transactionId, message: "Susu contribution logged successfully" });
  } catch (err) {
    console.error("Susu insert error:", err);
    res.status(500).json({ success: false, message: err.sqlMessage || "Failed to log susu contribution" });
  }
});

module.exports = router;
