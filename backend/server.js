const path = require("path");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require("http");
const socketIo = require("socket.io");

const { sendWithdrawal } = require("./momo/disbursements");
const recordsRoute = require("./routes/recordsRoute");

const app = express();
const server = http.createServer(app);

// ✅ Serve frontend files
app.use(express.static(path.join(__dirname, ".."))); 

// ✅ Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

// ✅ Socket.IO setup
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on("connection", (socket) => {
    console.log("✅ User connected:", socket.id);

    socket.on("disconnect", () => {
        console.log("❌ User disconnected:", socket.id);
    });
});

// Make socket accessible in routes
app.set("socketio", io);

// ✅ Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/notifications", require("./routes/notifications"));
const dashboardRoutes = require("./routes/em_index");
app.use("/api/dashboard", dashboardRoutes);
app.use("/api", recordsRoute);

// ✅ Withdrawal Endpoint
app.post("/withdraw", async (req, res) => {
    const { phone, amount, id } = req.body;

    const ref = await sendWithdrawal(phone, amount, id);

    if (!ref) {
        return res.status(500).json({ message: "Withdrawal Failed", status: false });
    }

    res.json({ referenceId: ref, status: true });
});

// ✅ Start server (ONLY ONCE)
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`🔥 Server running on http://localhost:${PORT}`);
});
