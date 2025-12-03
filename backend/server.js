// server.js — FINAL, CLEAN, 100% WORKING VERSION (2025)
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const db = require('./config/db');  // your DB connection

// MoMo & Records
const { sendWithdrawal } = require('./momo/disbursements');
const recordsRoute = require('./routes/recordsRoute');

// AUTH + MIDDLEWARE
const authModule = require('./routes/auth');
const auth = authModule.router;
const authenticateToken = authModule.authenticateToken;  // ← THIS IS KEY

// All other routes
const users = require('./routes/users');
const profile = require('./routes/profile');
const notifications = require('./routes/notifications');
const dashboardRoutes = require('./routes/em_index');
const managerRoutes = require('./routes/manager');
const managerDashboard = require('./routes/managerDashboard');
const adminRoutes = require('./routes/admin');
const transactionRoutes = require('./routes/transactions');  // ← your new route

const app = express();
const server = http.createServer(app);

// =======================
// SOCKET.IO SETUP
// =======================
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinAgent", (userId) => {
    socket.join(`agent_${userId}`);
    console.log(`Agent ${userId} joined room`);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

app.set("socketio", io);

// =======================
// MIDDLEWARE
// =======================
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

// Serve frontend (adjust path if needed)
app.use(express.static(path.join(__dirname, '..'))); // serves your HTML/CSS/JS

// =======================
// ROUTES
// =======================
app.use("/api/auth", auth);
app.use("/api/users", authenticateToken, users);
app.use("/api/profile", authenticateToken, profile);
app.use("/api/notifications", authenticateToken, notifications);
app.use("/api/dashboard", authenticateToken, dashboardRoutes);
app.use("/api", recordsRoute);

// PROTECTED ROUTES
app.use('/api/manager', authenticateToken, managerRoutes);
app.use('/api/manager-dashboard', authenticateToken, managerDashboard);
app.use('/api/admin', authenticateToken, adminRoutes);
app.use('/api/manager-agents-full', authenticateToken, require('./routes/m_agents'));

// THIS LINE WAS MISSING — PROTECT YOUR TRANSACTION ROUTES!
app.use('/api/transactions', authenticateToken, transactionRoutes);

// =======================
// WITHDRAW / DEPOSIT ENDPOINT (MoMo)
// =======================
app.post("/withdraw", authenticateToken, async (req, res) => {
  const { 
    phone, 
    amount, 
    id: transaction_id, 
    type = 'withdraw', 
    agent_name, 
    network = 'MTN' 
  } = req.body;

  if (!phone || !amount || !transaction_id) {
    return res.status(400).json({ status: false, message: "Missing fields" });
  }

  const agentId = req.user.id;
  const agentName = agent_name || `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim();

  try {
    let momoRef;

    if (type === 'deposit') {
      console.log(`DEPOSIT: GHS ${amount} from ${phone} | Agent: ${agentName}`);
      momoRef = "DEP_" + transaction_id;
    } else {
      momoRef = await sendWithdrawal(phone, amount, transaction_id);
      if (!momoRef) {
        return res.status(500).json({ status: false, message: "MoMo withdrawal failed" });
      }
    }

    // SAVE TO momo_transactions
    db.query(
      `INSERT INTO momo_transactions 
       (transaction_id, agent_id, agent_name, customer_phone, amount, type, network, momo_reference, reference_note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')`,
      [
        transaction_id,
        agentId,
        agentName,
        phone,
        amount,
        type,
        network,
        momoRef,
        `${type === 'deposit' ? 'Deposit' : 'Withdrawal'} by ${agentName}`
      ],
      (err) => {
        if (err) console.error("Save failed:", err);
        else {
          console.log(`MoMo Transaction SAVED → ${transaction_id}`);
          // EMIT REAL-TIME UPDATE
          io.to(`agent_${agentId}`).emit('newTransaction', {
            transaction_id,
            amount,
            type,
            table: 'momo',
            network,
            customer_phone: phone,
            agent_name: agentName,
            created_at: new Date().toISOString()
          });
        }
      }
    );

    res.json({
      status: true,
      referenceId: momoRef || transaction_id,
      message: "Transaction successful"
    });

  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ status: false, message: "Server error" });
  }
});

// TEST MoMo
app.get("/test-momo", async (req, res) => {
  const result = await sendWithdrawal("233541234567", 5, "test-" + Date.now());
  res.json(result ? { success: true, ref: result } : { success: false });
});

// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Open: http://localhost:${PORT}/EMPLOYEE/pages/index.html`);
});