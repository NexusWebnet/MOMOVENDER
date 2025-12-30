// backend/routes/em_index.js — UPDATED: FIXED QUERIES, IMPROVED PERFORMANCE & ERROR HANDLING
const express = require("express");
const router = express.Router();
const db = require("../config/db");

// Promisify query
const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

// ====================== AUTH CHECK MIDDLEWARE ======================
router.use((req, res, next) => {
  if (!req.user || req.user.role !== 'employee') {
    return res.status(403).json({ success: false, message: "Access denied. Employees only." });
  }
  next();
});

// ====================== DASHBOARD — TODAY'S STATS ======================
router.get("/dashboard", async (req, res) => {
  const userId = req.user.id;
  const today = new Date().toISOString().slice(0, 10);

  try {
    // 1. Total amount today (all services)
    const totalRes = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM (
         SELECT amount FROM momo_transactions WHERE agent_id = ? AND DATE(created_at) = ?
         UNION ALL
         SELECT amount FROM bank_transactions WHERE agent_id = ? AND DATE(created_at) = ?
         UNION ALL
         SELECT amount FROM airtime_logs WHERE employee_id = ? AND DATE(created_at) = ?
         UNION ALL
         SELECT amount FROM sim_sales WHERE employee_id = ? AND DATE(created_at) = ?
         UNION ALL
         SELECT amount FROM susu_contributions WHERE agent_id = ? AND DATE(created_at) = ?
       ) AS combined`,
      [userId, today, userId, today, userId, today, userId, today, userId, today]
    );

    // 2. Count of transactions today per service
    const countRes = await query(
      `SELECT 
        (SELECT COUNT(*) FROM momo_transactions WHERE agent_id = ? AND DATE(created_at) = ?) AS momo_count,
        (SELECT COUNT(*) FROM bank_transactions WHERE agent_id = ? AND DATE(created_at) = ?) AS bank_count,
        (SELECT COUNT(*) FROM airtime_logs WHERE employee_id = ? AND DATE(created_at) = ?) AS airtime_count,
        (SELECT COUNT(*) FROM sim_sales WHERE employee_id = ? AND DATE(created_at) = ?) AS sim_count,
        (SELECT COUNT(*) FROM susu_contributions WHERE agent_id = ? AND DATE(created_at) = ?) AS susu_count`,
      [userId, today, userId, today, userId, today, userId, today, userId, today]
    );

    const totalAmount = parseFloat(totalRes[0]?.total || 0);
    const counts = countRes[0] || {};
    const totalRecords = 
      (counts.momo_count || 0) + 
      (counts.bank_count || 0) + 
      (counts.airtime_count || 0) + 
      (counts.sim_count || 0) + 
      (counts.susu_count || 0);

    res.json({
      success: true,
      data: {
        totalTransactions: totalAmount,
        momoTransactions: counts.momo_count || 0,
        bankTransactions: counts.bank_count || 0,
        airtimeTransactions: counts.airtime_count || 0,
        simTransactions: counts.sim_count || 0,
        susuTransactions: counts.susu_count || 0,
        totalRecords
      }
    });
  } catch (err) {
    console.error("Dashboard fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to load dashboard stats" });
  }
});

// ====================== LATEST TRANSACTIONS ======================
router.get("/latest/:limit?", async (req, res) => {
  const userId = req.user.id;
  const limit = parseInt(req.params.limit) || 10;

  try {
    const records = await query(
      `SELECT 
        customer_name, 
        COALESCE(customer_phone, customer_account) AS phone_or_account,
        service, 
        amount, 
        created_at, 
        detail
       FROM (
         SELECT customer_name, customer_phone, 'MoMo' AS service, amount, created_at, network AS detail 
         FROM momo_transactions WHERE agent_id = ?
         UNION ALL
         SELECT customer_name, customer_account, type AS service, amount, created_at, bank_name AS detail 
         FROM bank_transactions WHERE agent_id = ?
         UNION ALL
         SELECT customer_name, customer_phone, 'Airtime' AS service, amount, created_at, network AS detail 
         FROM airtime_logs WHERE employee_id = ?
         UNION ALL
         SELECT customer_name, customer_phone, 'SIM' AS service, amount, created_at, network AS detail 
         FROM sim_sales WHERE employee_id = ?
         UNION ALL
         SELECT customer_name, customer_phone, 'Susu' AS service, amount, created_at, susu_group AS detail 
         FROM susu_contributions WHERE agent_id = ?
       ) AS combined
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, userId, userId, userId, userId, limit]
    );

    res.json({ success: true, data: records });
  } catch (err) {
    console.error("Latest transactions error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch latest transactions" });
  }
});

module.exports = router;