// server.js — FINAL UPDATED WITH ROOT REDIRECT, NGROK & NETWORK IP SUPPORT

const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const os = require('os');
require('dotenv').config();
const db = require('./config/db');

// =======================
// APP & SERVER SETUP
// =======================
const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));

// FORCE JSON ON ALL API RESPONSES
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
  }
  next();
});

// =======================
// MINIMAL STATIC FILE SERVING
// =======================
app.use(express.static(path.join(__dirname, '..')));
app.use('/ADMIN', express.static(path.join(__dirname, '..', 'ADMIN')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'ADMIN', 'admin.html'));
});

// FIXED: ROOT REDIRECT — NO MORE "Cannot GET /"
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// Optional: Also redirect /index
app.get('/index', (req, res) => {
  res.redirect('/login.html');
});

// =======================
// SOCKET.IO SETUP
// =======================
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const onlineAgents = new Map();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("registerUser", (user) => {
    if (!user || !user.id) return;

    onlineAgents.set(socket.id, {
      id: user.id,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      role: user.role || 'agent'
    });

    emitActiveAgents();
  });

  socket.on("joinAgent", (userId) => {
    socket.join(`agent_${userId}`);
    console.log(`Agent ${userId} joined room`);
  });

  socket.on("disconnect", () => {
    onlineAgents.delete(socket.id);
    emitActiveAgents();
    console.log("User disconnected:", socket.id);
  });
});

function emitActiveAgents() {
  const count = [...onlineAgents.values()].filter(u => u.role === 'agent').length;
  io.emit("activeAgentsUpdate", count);
}

app.set("socketio", io);
global.io = io;

// =======================
// ROUTES IMPORT
// =======================
const { router: authRouter } = require('./routes/auth');
const airtimeRoute = require("./routes/airtimeRoute");
const simRegistrationRoutes = require('./routes/simRegistrationRoutes');
const receiptRoutes = require("./routes/receiptRoutes");
const dashboardRoutes = require('./routes/em_index');
const users = require('./routes/users');
const profile = require('./routes/profile');
const notifications = require('./routes/notifications');
const managerRoutes = require('./routes/manager');
const managerDashboard = require('./routes/managerDashboard');
const adminRoutes = require('./routes/admin');
const adminAgents = require('./routes/adminAgents');
const adminFloat = require('./routes/adminFloat');
const adminPayroll = require('./routes/adminPayroll');
const managerAgentsFull = require('./routes/m_agents');
const branchesRoutes = require('./routes/branches');
const susuRoute = require("./routes/susuRoute");
const momoTransactionsRoute = require("./routes/momoTransactionsRoute");
const bankTransactionsRoute = require("./routes/bankTransactionsRoute");
const simTransactionsRoute = require("./routes/simTransactionsRoute");
const airtimeTransactionsRoute = require("./routes/airtimeTransactionsRoute");
const susuTransactionsRoute = require("./routes/susuTransactionsRoute");
const bankDepositRouter = require('./routes/bank_deposit');
const bankWithdrawalRouter = require('./routes/bank_withdrawal');
const reportRouter = require('./routes/admin_report');
const adminHistory = require('./routes/adminHistory');

// =======================
// ROUTE MOUNTING
// =======================
app.use("/api/auth", authRouter);
app.use("/api/airtime", airtimeRoute);
app.use("/api/records", simRegistrationRoutes);
app.use("/records/receipt", receiptRoutes);
app.use("/records/dashboard", dashboardRoutes);
app.use("/api/records", susuRoute);

app.use("/api/transactions/momo", momoTransactionsRoute);
app.use("/api/transactions/bank", bankTransactionsRoute);
app.use("/api/transactions/sim", simTransactionsRoute);
app.use("/api/transactions/airtime", airtimeTransactionsRoute);
app.use("/api/transactions/susu", susuTransactionsRoute);
app.use("/api/transactions", simRegistrationRoutes);

app.use("/api/admin", adminRoutes);
app.use("/api/admin/agents", adminAgents);
app.use("/api/admin/float", adminFloat);
app.use("/api/payroll", adminPayroll);
app.use("/api/admin/history", adminHistory);
app.use("/api/admin/branches", branchesRoutes);
app.use('/api/branches', branchesRoutes);

app.use('/bank-deposit', bankDepositRouter);
app.use('/bank-withdrawal', bankWithdrawalRouter);

app.use("/api/reports", reportRouter);
app.use("/api/users", users);
app.use("/api/profile", profile);
app.use("/api/notifications", notifications);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/manager", managerRoutes);
app.use("/api/manager-dashboard", managerDashboard);
app.use("/api/manager-agents-full", managerAgentsFull);

// =======================
// WITHDRAW / DEPOSIT (MoMo)
// =======================
app.post("/withdraw", async (req, res) => {
  const { phone, amount, id: transaction_id, type = 'withdraw', agent_name, network = 'MTN' } = req.body;

  if (!phone || !amount || !transaction_id) {
    return res.status(400).json({ status: false, message: "Missing fields" });
  }

  try {
    let momoRef = type === 'deposit' ? "DEP_" + transaction_id : "WD_" + transaction_id;

    db.query(
      `INSERT INTO momo_transactions
       (transaction_id, agent_id, agent_name, customer_phone, amount, type, network, momo_reference, reference_note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')`,
      [transaction_id, req.user?.id || 1, agent_name || 'Unknown', phone, amount, type, network, momoRef, `${type} by ${agent_name || 'Agent'}`],
      (err) => {
        if (!err) {
          io.emit("newTransaction", {
            transaction_id,
            agent_id: req.user?.id,
            agent_name,
            amount,
            type,
            network,
            customer_phone: phone,
            created_at: new Date().toISOString()
          });

          io.to(`agent_${req.user?.id}`).emit("newTransaction", {
            transaction_id,
            amount,
            type,
            network
          });
        }
      }
    );

    res.json({ status: true, referenceId: momoRef });
  } catch (err) {
    console.error("Withdraw error:", err);
    res.status(500).json({ status: false, message: "Server error" });
  }
});

// =======================
// NETWORK IP & NGROK DETECTION
// =======================
function getNetworkIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

// =======================
// START SERVER WITH ENHANCED LOGGING
// =======================
const PORT = process.env.PORT || 8000;
server.listen(PORT, '0.0.0.0', () => {
  const localUrl = `http://localhost:${PORT}`;
  const networkIPs = getNetworkIPs();

  console.log(`\n🚀 MoMo Empire Server Running on Port ${PORT}!`);
  console.log(`📱 Local Access:     ${localUrl}/login.html`);
  console.log(`🖥️  Admin Dashboard: ${localUrl}/ADMIN/admin.html`);

  if (networkIPs.length > 0) {
    console.log(`\n🌐 Access from phones/tablets on your WiFi:`);
    networkIPs.forEach(ip => {
      console.log(`   http://${ip}:${PORT}/login.html`);
      console.log(`   http://${ip}:${PORT}/ADMIN/admin.html`);
    });
  }

  if (process.env.NGROK_URL) {
    console.log(`\n🔗 Ngrok Public URL:`);
    console.log(`   ${process.env.NGROK_URL}/login.html`);
    console.log(`   ${process.env.NGROK_URL}/ADMIN/admin.html`);
  } else {
    console.log(`\n💡 For public access, run:`);
    console.log(`   ngrok http ${PORT}`);
  }

  console.log(`\n⏰ Started: ${new Date().toLocaleString()}\n`);
});