const express = require("express");
const router = express.Router();
const db = require("../config/db");

// ✅ SEND NOTIFICATION (Real-time)
router.post("/send", (req, res) => {
    const { sender_id, receiver_id, message } = req.body;
    const io = req.app.get("socketio");

    db.query(
        "INSERT INTO notifications (sender_id, receiver_id, message) VALUES (?, ?, ?)",
        [sender_id, receiver_id, message],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });

            // ✅ Emit notification to frontend INSTANTLY
            io.emit(`notification_${receiver_id}`, {
                id: result.insertId,
                sender_id,
                receiver_id,
                message,
                created_at: new Date(),
                is_read: 0
            });

            res.status(200).json({ success: true, message: "Notification sent!" });
        }
    );
});

// ✅ GET NOTIFICATIONS FOR LOGGED-IN USER
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

// ✅ MARK AS READ
router.put("/read/:id", (req, res) => {
    db.query(
        "UPDATE notifications SET is_read = 1 WHERE id = ?",
        [req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err });

            res.status(200).json({ success: true });
        }
    );
});


const user = JSON.parse(localStorage.getItem("user"));

async function sendNotification() {
    const receiver_id = document.getElementById("receiverSelect").value;
    const message = document.getElementById("messageInput").value.trim();

    if (message === "" || receiver_id === "") {
        return alert("Please enter message & select receiver.");
    }

    const res = await fetch("http://localhost:8000/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            sender_id: user.id,
            receiver_id,
            message
        })
    });

    const data = await res.json();

    if (data.success) {
        alert("✅ Message sent!");
        document.getElementById("messageInput").value = "";
    } else {
        alert("❌ Error sending message.");
    }
}

async function loadUsers() {
    const res = await fetch("http://localhost:8000/api/users");
    const users = await res.json();

    const select = document.getElementById("receiverSelect");
    users.forEach(user => {
        const option = document.createElement("option");
        option.value = user.id;
        option.textContent = `${user.first_name} (${user.role})`;
        select.appendChild(option);
    });
}

loadUsers();



module.exports = router;
