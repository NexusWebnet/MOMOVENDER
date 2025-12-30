const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "fallback_secret";

// -----------------------------
// Bearer Token Middleware
// -----------------------------
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

// Optional role-based access
const requireEmployeeOrAdmin = (req, res, next) => {
  const role = (req.user?.role || '').toLowerCase().trim();
  if (['employee', 'manager', 'admin', 'owner', 'superadmin', 'queen'].includes(role)) return next();
  return res.status(403).json({ success: false, message: 'Employee or Admin access required' });
};

// Apply authentication
router.use(authenticateToken);
// router.use(requireEmployeeOrAdmin); // Uncomment if only employees/admins should access

// -----------------------------
// Helper: Promise-based query
// -----------------------------
const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => (err ? reject(err) : resolve(results)));
  });

// -----------------------------
// Helper: Generate MoMo Transaction ID
// -----------------------------
function generateTransactionId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `MT${timestamp}${random}`;
}

// -----------------------------
// GET /api/transactions/momo
// -----------------------------
router.get('/', async (req, res) => {
  const agentId = req.user.id;
  const { start, end } = req.query;

  try {
    let sql = `
      SELECT 
        transaction_id,
        type,
        customer_name,
        customer_phone,
        amount,
        network,
        status,
        momo_reference,
        reference_note,
        created_at
      FROM momo_transactions
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
    console.error("MoMo transactions fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch transactions" });
  }
});

// -----------------------------
// POST /api/transactions/momo
// -----------------------------
router.post('/', async (req, res) => {
  const agentId = req.user.id;
  const agentName = `${req.user.first_name || ""} ${req.user.last_name || ""}`.trim() || "Agent";

  const {
    customer_name,
    customer_phone,
    amount,
    type,
    network = "MTN",
    momo_reference,
    reference_note = "MoMo transaction"
  } = req.body;

  // Validation
  if (!customer_name || !customer_phone || !amount || !type) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ success: false, message: "Invalid amount" });
  }

  const transactionId = generateTransactionId();

  try {
    const sql = `
      INSERT INTO momo_transactions 
      (transaction_id, agent_id, agent_name, customer_name, customer_phone, amount, type, network, momo_reference, reference_note, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success', NOW())
    `;
    const values = [
      transactionId,
      agentId,
      agentName,
      customer_name.trim(),
      customer_phone.trim(),
      parsedAmount,
      type.trim(),
      network.trim(),
      momo_reference || null,
      reference_note.trim()
    ];

    const result = await query(sql, values);

    const newTxn = {
      transaction_id: transactionId,
      agent_id: agentId,
      agent_name: agentName,
      customer_name: customer_name.trim(),
      customer_phone: customer_phone.trim(),
      amount: parsedAmount,
      type: type.trim(),
      network: network.trim(),
      momo_reference: momo_reference || null,
      reference_note: reference_note.trim(),
      status: "success",
      created_at: new Date().toISOString()
    };

    // Emit Socket.IO event safely
    const io = req.app.get("socketio");
    if (io) {
      io.emit("newTransaction", { ...newTxn, service: "momo" });
      console.log("Emitted newTransaction event for MoMo transaction");
    }

    res.status(201).json({ success: true, data: newTxn, message: "MoMo transaction logged successfully" });
  } catch (err) {
    console.error("MoMo transaction insert error:", err);
    res.status(500).json({ success: false, message: "Transaction failed" });
  }
});

module.exports = router;
