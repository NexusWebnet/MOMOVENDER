const express = require("express");
const router = express.Router();
const db = require("../config/db"); // Ensure this points to your MySQL connection

// ✅ Get user transaction records
router.get("/records/:id", async (req, res) => {
  const { id } = req.params;
  const { type, role } = req.query;

  try {
    let query = `
      SELECT t.*, 
             CONCAT(u.first_name, ' ', u.last_name) AS sender_name,
             CONCAT(r.first_name, ' ', r.last_name) AS receiver_name
      FROM transactions t
      JOIN users u ON t.sender_id = u.user_id
      JOIN users r ON t.receiver_id = r.user_id
    `;
    const params = [];

    if (role === "admin") {
      // Admin can view all transactions, filtered by type
      if (type === "momo") {
        query += " WHERE t.payment_method = 'momo'";
      } else if (type === "bank") {
        query += " WHERE t.payment_method = 'bank'";
      } else if (type === "sim") {
        query += " WHERE t.transaction_type = 'sim_sale'";
      } // else type === "transaction" or all => no WHERE, show all
    } else {
      // Employees/managers see only their own transactions
      query += " WHERE (t.sender_id = ? OR t.receiver_id = ?)";
      params.push(id, id);

      if (type === "momo") {
        query += " AND t.payment_method = 'momo'";
      } else if (type === "bank") {
        query += " AND t.payment_method = 'bank'";
      } else if (type === "sim") {
        query += " AND t.transaction_type = 'sim_sale'";
      }
    }

    query += " ORDER BY t.created_at DESC";

    // Execute the query
    const [rows] = await db.execute(query, params);
    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching records:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
