const express = require("express");
const router = express.Router();
const db = require("../config/db"); // your MySQL connection

// Get dashboard data for a user
router.get("/:userId", async (req, res) => {
  const userId = req.params.userId;
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  try {
    // Total transactions today (by this user)
    const [totalResult] = await db.execute(
      `SELECT IFNULL(SUM(amount), 0) AS total 
       FROM transactions 
       WHERE DATE(created_at) = ? AND sender_id = ?`,
      [today, userId]
    );

    // Momo transactions today
    const [momoResult] = await db.execute(
      `SELECT IFNULL(SUM(amount), 0) AS total 
       FROM transactions 
       WHERE DATE(created_at) = ? AND payment_method = 'momo' AND sender_id = ?`,
      [today, userId]
    );

    // Bank transactions today
    const [bankResult] = await db.execute(
      `SELECT IFNULL(SUM(amount), 0) AS total 
       FROM transactions 
       WHERE DATE(created_at) = ? AND payment_method = 'bank' AND sender_id = ?`,
      [today, userId]
    );

    // Sim sales today (assuming `sim_sales` has `user_id` column)
    const [simResult] = await db.execute(
      `SELECT COUNT(*) AS total 
       FROM sim_sales 
       WHERE sale_date = ? AND user_id = ?`,
      [today, userId]
    );

    res.json({
      totalTransactions: totalResult[0].total || 0,
      momoTransactions: momoResult[0].total || 0,
      bankTransactions: bankResult[0].total || 0,
      simSales: simResult[0].total || 0
    });
  } catch (err) {
    console.error("Dashboard fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
