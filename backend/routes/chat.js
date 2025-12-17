const express = require("express");
const router = express.Router();
const db = require("../config/db");
const bcrypt = require('bcryptjs');

// ✅ save chat + store as notification
router.post("/send", async (req, res) => {
    const { sender_id, receiver_id, message } = req.body;

    try {
        await db.query(
            "INSERT INTO chat (sender_id, receiver_id, message, status) VALUES (?, ?, ?, ?)",
            [sender_id, receiver_id, message, "unread"]
        );

        // ✅ store it in notifications too
        await db.query(
            "INSERT INTO notifications (user_id, message, is_read) VALUES (?, ?, 0)",
            [receiver_id, message]
        );

        res.json({ success: true, message: "Message sent & saved as notification" });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to send message" });
    }
});

module.exports = router;
