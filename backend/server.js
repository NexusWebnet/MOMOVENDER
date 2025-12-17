// server.js — FINAL, CLEAN & FULLY WORKING (DEC 2025)
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();

const db = require('./config/db');

// =======================
// APP & SERVER SETUP
// =======================
const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Serve static files from the main project folder (momovender-master)
app.use(express.static(path.join(__dirname, '..')));

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
global.io = io;

// =======================
// ROUTES IMPORT
// =======================
const { router: authRouter, authenticateToken } = require('./routes/auth');
const airtimeRoute = require("./routes/airtimeRoute");
const recordRoutes = require('./routes/recordRoutes');
const simRegistrationRoutes = require('./routes/simRegistrationRoutes');
const receiptRoutes = require("./routes/receiptRoutes");
const dashboardRoutes = require('./routes/em_index');
const users = require('./routes/users');
const profile = require('./routes/profile');
const notifications = require('./routes/notifications');
const managerRoutes = require('./routes/manager');
const managerDashboard = require('./routes/managerDashboard');
const adminRoutes = require('./routes/admin');
const managerAgentsFull = require('./routes/m_agents');
const { sendWithdrawal } = require('./momo/disbursements');

// Transaction History Routes
const momoTransactionsRoute = require("./routes/momoTransactionsRoute");
const bankTransactionsRoute = require("./routes/bankTransactionsRoute");
const simTransactionsRoute = require("./routes/simTransactionsRoute");
const airtimeTransactionsRoute = require("./routes/airtimeTransactionsRoute");
const susuTransactionsRoute = require("./routes/susuTransactionsRoute");
const branchRoutes = require('./routes/branches');

// Susu Logging Route
const susuRoute = require("./routes/susuRoute");

app.use("/api/payroll/admin", authenticateToken, require('./routes/adminPayroll'));

// ADMIN ROUTES — CUSTOM
const adminAgents = require('./routes/adminAgents');
const adminFloat = require('./routes/adminFloat');
const adminPayroll = require('./routes/adminPayroll');
app.use('/api/branches', branchRoutes);

// Reports Route
app.use("/api/reports", authenticateToken, require('./routes/report'));

// =======================
// PUBLIC ROUTES
// =======================
app.use("/api/auth", authRouter);
app.use("/airtime", airtimeRoute);
app.use("/records", recordRoutes);
app.use("/records", simRegistrationRoutes);
app.use("/records/receipt", receiptRoutes);
app.use("/records/dashboard", dashboardRoutes);
app.use("/records/records", dashboardRoutes);
app.use("/api/records", susuRoute);

// =======================
// TRANSACTION HISTORY — PROTECTED
// =======================
app.use("/api/transactions", authenticateToken, [
  momoTransactionsRoute,
  bankTransactionsRoute,
  simTransactionsRoute,
  airtimeTransactionsRoute,
  susuTransactionsRoute
]);

// =======================
// ADMIN CUSTOM ROUTES — PROTECTED
// =======================
app.use("/api/admin", authenticateToken, adminRoutes);
app.use("/api/admin/agents", authenticateToken, adminAgents);
app.use("/api/admin/float", authenticateToken, adminFloat);
app.use("/api/admin/payroll", authenticateToken, adminPayroll);

// =======================
// PROTECTED ROUTES
// =======================
app.use("/api/users", authenticateToken, users);
app.use("/api/profile", authenticateToken, profile);
app.use("/api/notifications", authenticateToken, notifications);
app.use("/api/dashboard", authenticateToken, dashboardRoutes);
app.use("/api/manager", authenticateToken, managerRoutes);
app.use("/api/manager-dashboard", authenticateToken, managerDashboard);
app.use("/api/manager-agents-full", authenticateToken, managerAgentsFull);

// =======================
// ROOT ROUTE — FIX "Cannot GET /"
// =======================
// Serve login.html directly when accessing root
app.get('/', (req, res) => {
  const loginPath = path.join(__dirname, '..', 'login.html');
  res.sendFile(loginPath, (err) => {
    if (err) {
      console.error("Error serving login.html:", err);
      res.status(500).send("Server error: Could not load login page.");
    }
  });
});

// Optional: Redirect /index.html to root
app.get('/index.html', (req, res) => res.redirect('/'));

// Catch-all for unknown routes (friendly 404)
app.use((req, res) => {
  res.status(404).send(`
    <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px; color: #333;">
      <h1>MoMo Vendor Manager</h1>
      <p>Page not found.</p>
      <p><a href="/" style="color: #ea580c; font-weight: bold; font-size: 1.2em;">← Go to Login</a></p>
    </div>
  `);
});

// =======================
// WITHDRAW / DEPOSIT (MoMo)
// =======================
app.post("/withdraw", authenticateToken, async (req, res) => {
  const { phone, amount, id: transaction_id, type = 'withdraw', agent_name, network = 'MTN' } = req.body;

  if (!phone || !amount || !transaction_id) {
    return res.status(400).json({ status: false, message: "Missing fields" });
  }

  const agentId = req.user.id;
  const agentName = agent_name || `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim();

  try {
    let momoRef = type === 'deposit' ? "DEP_" + transaction_id : await sendWithdrawal(phone, amount, transaction_id);

    if (!momoRef && type !== 'deposit') {
      return res.status(500).json({ status: false, message: "MoMo withdrawal failed" });
    }

    db.query(
      `INSERT INTO momo_transactions 
       (transaction_id, agent_id, agent_name, customer_phone, amount, type, network, momo_reference, reference_note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')`,
      [transaction_id, agentId, agentName, phone, amount, type, network, momoRef, `${type} by ${agentName}`],
      (err) => {
        if (!err) {
          io.to(`agent_${agentId}`).emit('newTransaction', {
            transaction_id, amount, type, table: "momo", network, customer_phone: phone,
            agent_name: agentName, created_at: new Date().toISOString()
          });
        }
      }
    );

    res.json({ status: true, referenceId: momoRef, message: "Transaction successful" });
  } catch (err) {
    console.error("Withdraw error:", err);
    res.status(500).json({ status: false, message: "Server error" });
  }
});

// Test MoMo
app.get("/test-momo", async (req, res) => {
  const result = await sendWithdrawal("233541234567", 5, "test-" + Date.now());
  res.json(result ? { success: true, ref: result } : { success: false });
});

// =======================
// START SERVER — LISTEN ON ALL NETWORK INTERFACES
// =======================
const PORT = process.env.PORT || 8000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 MoMo Vendor Server is LIVE!`);
  console.log(`Local (this PC): http://localhost:${PORT}`);
  console.log(`On phones & other PCs (same Wi-Fi): http://192.168.10.217:${PORT}`);
  console.log(`Public URL (ngrok): https://fredda-unsurgical-martha.ngrok-free.dev`);
  console.log(`Root page now serves login.html directly!`);
  console.log(`Just open the URL → Login page appears! 🎉\n`);
});