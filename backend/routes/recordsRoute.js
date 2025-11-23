const express = require("express");
const router = express.Router();
const db = require("../config/db"); // your MySQL connection
const bcrypt = require('bcryptjs');

// GET /api/records/:userId?type=&role=
router.get("/records/:userId", async (req, res) => {
    const { userId } = req.params;
    const { type, role } = req.query;

    try {
        let query = `
            SELECT 
                t.transaction_id,
                t.transaction_type,
                t.payment_method,
                t.amount,
                t.status,
                t.created_at,
                t.user_id,
                t.store_id
            FROM transactions t
            WHERE 1=1
        `;
        
        const params = [];

        // FILTER BY RECORD TYPE
        if (type && type !== "transaction") {
            query += ` AND t.transaction_type = ? `;
            params.push(type);
        }

        // ROLE FILTERING
        if (role === "user") {
            query += ` AND t.user_id = ? `;
            params.push(userId);
        } 
        else if (role === "manager") {
            // Get store_id the manager manages
            const [managerRow] = await db.query(
                "SELECT store_id FROM users WHERE id = ? LIMIT 1",
                [userId]
            );

            if (!managerRow || managerRow.length === 0) {
                return res.json([]);
            }

            const storeId = managerRow[0].store_id;

            query += ` AND t.store_id = ? `;
            params.push(storeId);
        }
        else if (role === "admin") {
            // ❗ Admin sees all — NO filter added
        }

        query += " ORDER BY t.created_at DESC";

        const [rows] = await db.query(query, params);
        res.json(rows);

    } catch (err) {
        console.error("❌ Error fetching records:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = router;
