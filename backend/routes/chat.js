// backend/routes/chat.js — REAL-TIME CHAT + NOTIFICATIONS
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { authenticateToken } = require("./auth");

// Promisify db.query
const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

// Middleware: Authenticate via cookie
router.use(authenticateToken);

// POST /chat/send — Send chat message + store as notification
router.post("/send", async (req, res) => {
  const sender_id = req.user.id; // from authenticated user
  const { receiver_id, message } = req.body;

  // Validation
  if (!receiver_id || !message || message.trim() === "") {
    return res.status(400).json({ success: false, message: "Receiver ID and message are required" });
  }

  if (sender_id === receiver_id) {
    return res.status(400).json({ success: false, message: "Cannot send message to yourself" });
  }

  try {
    // Save chat message
    await query(
      "INSERT INTO chat (sender_id, receiver_id, message, status) VALUES (?, ?, ?, 'unread')",
      [sender_id, receiver_id, message.trim()]
    );

    // Save as notification for receiver
    await query(
      "INSERT INTO notifications (user_id, message, type, is_read, created_at) VALUES (?, ?, 'chat', 0, NOW())",
      [receiver_id, `New message from user ${sender_id}: ${message.trim()}`]
    );

    // Emit real-time via Socket.io
    const io = req.app.get("socketio");
    if (io) {
      io.to(`user_${receiver_id}`).emit("newMessage", {
        sender_id,
        receiver_id,
        message: message.trim(),
        timestamp: new Date().toISOString()
      });

      io.to(`user_${receiver_id}`).emit("notification", {
        type: "chat",
        message: `New message from user ${sender_id}`,
        timestamp: new Date().toISOString()
      });
    }

    res.json({ success: true, message: "Message sent and saved as notification" });
  } catch (err) {
    console.error("Chat send error:", err);
    res.status(500).json({ success: false, message: "Failed to send message" });
  }
});

module.exports = router;