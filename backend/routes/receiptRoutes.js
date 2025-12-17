// backend/routes/receiptRoutes.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { authenticateToken } = require("./auth");

// Promisify db.query
const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
};

// GET /records/receipt/:transactionId — Fetch receipt for any transaction
router.get("/:transactionId", authenticateToken, async (req, res) => {
  const { transactionId } = req.params;

  if (!transactionId) {
    return res.status(400).json({ 
      success: false, 
      message: "Transaction ID is required" 
    });
  }

  try {
    let result = null;
    let source = "";

    // Search SIM Sales
    const simResults = await query(
      `SELECT *, 'SIM Registration' AS service_type FROM sim_sales WHERE transaction_id = ?`,
      [transactionId]
    );
    if (simResults.length > 0) {
      result = simResults[0];
      source = "sim_sales";
    }

    // Search MoMo Transactions
    if (!result) {
      const momoResults = await query(
        `SELECT *, type AS service_type FROM momo_transactions WHERE transaction_id = ?`,
        [transactionId]
      );
      if (momoResults.length > 0) {
        result = momoResults[0];
        source = "momo_transactions";
      }
    }

    // Search Bank Transactions
    if (!result) {
      const bankResults = await query(
        `SELECT *, type AS service_type FROM bank_transactions WHERE transaction_id = ?`,
        [transactionId]
      );
      if (bankResults.length > 0) {
        result = bankResults[0];
        source = "bank_transactions";
      }
    }

    // Search Airtime Logs
    if (!result) {
      const airtimeResults = await query(
        `SELECT *, 'Airtime Top-up' AS service_type, amount FROM airtime_logs WHERE id = ?`,
        [transactionId]
      );
      if (airtimeResults.length > 0) {
        result = airtimeResults[0];
        source = "airtime_logs";
      }
    }

    // Search Susu Contributions
    if (!result) {
      const susuResults = await query(
        `SELECT *, 'Susu Contribution' AS service_type FROM susu_contributions WHERE transaction_id = ?`,
        [transactionId]
      );
      if (susuResults.length > 0) {
        result = susuResults[0];
        source = "susu_contributions";
      }
    }

    if (!result) {
      return res.status(404).json({ 
        success: false, 
        message: "Transaction not found" 
      });
    }

    res.json({
      success: true,
      data: result,
      source
    });

  } catch (err) {
    console.error("Receipt fetch error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch receipt" 
    });
  }
});

module.exports = router;