// backend/routes/simTransactionsRoute.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { authenticateToken } = require("./auth");

// GET /api/transactions/sim — Get SIM registration history
router.get("/sim", authenticateToken, (req, res) => {
  const agentId = req.user.id;
  const { start, end } = req.query;

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

  const params = [agentId];

  if (start && end) {
    sql += ` AND DATE(created_at) BETWEEN ? AND ?`;
    params.push(start, end);
  }

  sql += ` ORDER BY created_at DESC LIMIT 1000`;

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error("SIM registration fetch error:", err);
      return res.status(500).json({ 
        success: false, 
        message: "Failed to fetch SIM registrations" 
      });
    }

    res.json({
      success: true,
      data: results || []
    });
  });
});

module.exports = router;