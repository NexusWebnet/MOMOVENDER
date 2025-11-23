const express = require("express");
const router = express.Router();
const db = require("../config/db"); // your MySQL connection
const bcrypt = require('bcryptjs');

// SEND NOTIFICATION
router.post("/send", (req, res) => {
    const { sender_id, receiver_id, message } = req.body;

    db.query(
        "INSERT INTO notifications (sender_id, receiver_id, message) VALUES (?, ?, ?)",
        [sender_id, receiver_id, message],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });
            res.status(200).json({ success: true, message: "Notification sent!" });
        }
    );
});

// GET NOTIFICATIONS FOR LOGGED-IN USER
router.get("/user/:receiver_id", (req, res) => {
    const receiver_id = req.params.receiver_id;

    db.query(
        `SELECT n.*, u.username AS from_user
         FROM notifications n 
         JOIN users u ON n.sender_id = u.id
         WHERE receiver_id = ?
         ORDER BY created_at DESC`,
        [receiver_id],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });
            res.status(200).json(result);
        }
    );
});

// MARK AS READ
router.put("/read/:id", (req, res) => {
    const id = req.params.id;

    db.query(
        "UPDATE notifications SET is_read = 1 WHERE id = ?",
        [id],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });
            res.status(200).json({ success: true });
        }
    );
});

module.exports = router;
