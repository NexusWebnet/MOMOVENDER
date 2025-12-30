// backend/routes/em_index.js — FIXED & WORKING WITH REAL TABLES
const express = require("express");
const router = express.Router();
const db = require("../config/db");

// Promisify for async/await
const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
};

// DASHBOARD DATA — TODAY'S STATS FOR EMPLOYEE
router.get("/dashboard/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId);
  const today = new Date().toISOString().slice(0, 10);

  try {
    // Total amount today (all services)
    const totalRes = await query(`
      SELECT 
        COALESCE(SUM(amount), 0) AS total
      FROM (
        SELECT amount FROM momo_transactions WHERE agent_id = ? AND DATE(created_at) = ?
        UNION ALL
        SELECT amount FROM bank_transactions WHERE agent_id = ? AND DATE(created_at) = ?
        UNION ALL
        SELECT amount FROM airtime_logs WHERE employee_id = ? AND DATE(created_at) = ?
        UNION ALL
        SELECT amount FROM sim_sales WHERE employee_id = ? AND DATE(created_at) = ?
      ) AS combined
    `, [userId, today, userId, today, userId, today, userId, today]);

    // Count records today
    const countRes = await query(`
      SELECT 
        (SELECT COUNT(*) FROM momo_transactions WHERE agent_id = ? AND DATE(created_at) = ?) AS momo_count,
        (SELECT COUNT(*) FROM bank_transactions WHERE agent_id = ? AND DATE(created_at) = ?) AS bank_count,
        (SELECT COUNT(*) FROM airtime_logs WHERE employee_id = ? AND DATE(created_at) = ?) AS airtime_count,
        (SELECT COUNT(*) FROM sim_sales WHERE employee_id = ? AND DATE(created_at) = ?) AS sim_count
    `, [userId, today, userId, today, userId, today, userId, today]);

    const counts = countRes[0];
    const totalRecords = counts.momo_count + counts.bank_count + counts.airtime_count + counts.sim_count;

    res.json({
      totalTransactions: parseFloat(totalRes[0].total || 0),
      momoTransactions: counts.momo_count,
      bankTransactions: counts.bank_count,
      totalRecords
    });
  } catch (err) {
    console.error("Dashboard fetch error:", err);
    res.status(500).json({ error: "Dashboard fetch failed" });
  }
});

// LATEST TRANSACTIONS
router.get("/latest/:userId", async (req, res) => fetchLatest(req, res));
router.get("/latest/:userId/:limit", async (req, res) => fetchLatest(req, res));

async function fetchLatest(req, res) {
  const userId = parseInt(req.params.userId);
  const limit = parseInt(req.params.limit) || 10;

  try {
    const records = await query(`
      SELECT customer_name, customer_phone, 'MoMo' AS type, amount, created_at, network AS source
      FROM momo_transactions WHERE agent_id = ?
      UNION ALL
      SELECT customer_name, customer_account AS customer_phone, type, amount, created_at, bank_name AS source
      FROM bank_transactions WHERE agent_id = ?
      UNION ALL
      SELECT customer_name, customer_phone, 'Airtime' AS type, amount, created_at, network AS source
      FROM airtime_logs WHERE employee_id = ?
      UNION ALL
      SELECT customer_name, customer_phone, 'SIM' AS type, amount, created_at, network AS source
      FROM sim_sales WHERE employee_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [userId, userId, userId, userId, limit]);

    res.json({ records });
  } catch (err) {
    console.error("Latest transactions error:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
}

module.exports = router;