// backend/routes/recordRoutes.js — FINAL & FULLY WORKING
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { authenticateToken } = require("./auth");

// POST /records/log — Main logging endpoint for all transaction types
router.post("/log", authenticateToken, (req, res) => {
  const agentId = req.user.id;
  const agentName = `${req.user.first_name || ""} ${req.user.last_name || ""}`.trim() || "Agent";
  const payload = req.body;
  const type = payload.type?.toLowerCase();

  if (!type) {
    return res.status(400).json({ success: false, message: "Transaction type is required" });
  }

  // MOMO DEPOSIT / WITHDRAWAL
  if (type === "deposit" || type === "withdraw") {
    const {
      customer_name,
      customer_phone,
      amount,
      network,
      reference_note = type === "deposit" ? "MoMo Deposit" : "MoMo Withdrawal",
      agent_name: frontendAgentName
    } = payload;

    if (!customer_name || !customer_phone || !amount || !network || amount <= 0) {
      return res.status(400).json({ success: false, message: "Missing required MoMo fields" });
    }

    const transactionId = "MM" + Date.now() + Math.floor(Math.random() * 999);

    const sql = `
      INSERT INTO momo_transactions 
      (transaction_id, agent_id, agent_name, customer_name, customer_phone, amount, type, network, reference_note, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')
    `;

    db.query(sql, [
      transactionId,
      agentId,
      frontendAgentName || agentName,
      customer_name.trim(),
      customer_phone.trim(),
      parseFloat(amount),
      type,
      network,
      reference_note.trim()
    ], (err) => {
      if (err) {
        console.error("MoMo transaction error:", err);
        return res.status(500).json({ success: false, message: "Failed to save MoMo transaction" });
      }

      const io = req.app.get('socketio');
      if (io) {
        io.emit("newTransaction", { type: "momo", amount: parseFloat(amount) });
      }

      res.json({ success: true, transactionId, message: "MoMo transaction logged successfully" });
    });

    return;
  }

  // BANK DEPOSIT
  if (type === "bank_deposit") {
    const {
      customer_name,
      customer_account,
      bank_name,
      amount,
      reference_note = "Bank Deposit",
      agent_name: frontendAgentName
    } = payload;

    if (!customer_name || !customer_account || !bank_name || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Missing fields for bank deposit" });
    }

    const transactionId = "BD" + Date.now() + Math.floor(Math.random() * 999);

    const sql = `
      INSERT INTO bank_transactions 
      (transaction_id, agent_id, agent_name, customer_name, customer_account, bank_name, amount, type, reference_note, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'deposit', ?, 'success')
    `;

    db.query(sql, [
      transactionId,
      agentId,
      frontendAgentName || agentName,
      customer_name.trim(),
      customer_account.trim(),
      bank_name,
      parseFloat(amount),
      reference_note.trim()
    ], (err) => {
      if (err) {
        console.error("Bank deposit error:", err);
        return res.status(500).json({ success: false, message: "Failed to save deposit" });
      }

      const io = req.app.get('socketio');
      if (io) {
        io.emit("newTransaction", { type: "bank_deposit", amount: parseFloat(amount) });
      }

      res.json({ success: true, transactionId, message: "Bank deposit logged" });
    });

    return;
  }

  // BANK WITHDRAWAL
  if (type === "bank_withdrawal") {
    const {
      customer_name,
      customer_account,
      bank_name,
      amount,
      reference_note = "Bank Withdrawal",
      agent_name: frontendAgentName
    } = payload;

    if (!customer_name || !customer_account || !bank_name || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Missing fields for bank withdrawal" });
    }

    const transactionId = "WD" + Date.now() + Math.floor(Math.random() * 999);

    const sql = `
      INSERT INTO bank_transactions 
      (transaction_id, agent_id, agent_name, customer_name, customer_account, bank_name, amount, type, reference_note, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'withdraw', ?, 'success')
    `;

    db.query(sql, [
      transactionId,
      agentId,
      frontendAgentName || agentName,
      customer_name.trim(),
      customer_account.trim(),
      bank_name,
      parseFloat(amount),
      reference_note.trim()
    ], (err) => {
      if (err) {
        console.error("Bank withdrawal error:", err);
        return res.status(500).json({ success: false, message: "Failed to save withdrawal" });
      }

      const io = req.app.get('socketio');
      if (io) {
        io.emit("newTransaction", { type: "bank_withdrawal", amount: parseFloat(amount) });
      }

      res.json({ success: true, transactionId, message: "Bank withdrawal logged" });
    });

    return;
  }

  // SUSU CONTRIBUTION
  if (type === "susu") {
    const {
      customer_name,
      customer_phone,
      amount,
      susu_group,
      reference = "Susu Contribution",
      agent_name: frontendAgentName
    } = payload;

    if (!customer_name || !customer_phone || !amount || !susu_group) {
      return res.status(400).json({ success: false, message: "Missing required susu fields" });
    }

    const transactionId = `SUSU_${Date.now()}`;

    const sql = `
      INSERT INTO susu_contributions 
      (transaction_id, customer_name, customer_phone, amount, susu_group, reference, agent_id, agent_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    db.query(sql, [
      transactionId,
      customer_name.trim(),
      customer_phone.trim(),
      parseFloat(amount),
      susu_group.trim(),
      reference.trim(),
      agentId,
      frontendAgentName || agentName
    ], (err) => {
      if (err) {
        console.error("Susu contribution error:", err);
        return res.status(500).json({ success: false, message: "Failed to log susu contribution" });
      }

      const io = req.app.get('socketio');
      if (io) {
        io.emit("newTransaction", { type: "susu", amount: parseFloat(amount) });
      }

      res.json({ success: true, transactionId, message: "Susu contribution logged successfully" });
    });

    return;
  }

  return res.status(400).json({ success: false, message: `Unsupported transaction type: ${type}` });
});

// GET /records/records — Personal transaction history
router.get("/records", authenticateToken, (req, res) => {
  const { limit = 50 } = req.query;
  const agentId = req.user.id;

  const sql = `
    (SELECT *, 'momo' as source FROM momo_transactions WHERE agent_id = ?)
    UNION ALL
    (SELECT *, 'bank' as source FROM bank_transactions WHERE agent_id = ?)
    ORDER BY created_at DESC LIMIT ?
  `;

  db.query(sql, [agentId, agentId, parseInt(limit)], (err, results) => {
    if (err) {
      console.error("Records fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to load records" });
    }
    res.json({ success: true, records: results });
  });
});

// GET /records/dashboard — Today's stats
router.get("/dashboard", authenticateToken, (req, res) => {
  const agentId = req.user.id;

  const sql = `
    SELECT 
      COALESCE(SUM(CASE WHEN type IN ('deposit', 'susu') THEN amount ELSE 0 END), 0) AS bank_total,
      COALESCE(SUM(CASE WHEN type NOT IN ('deposit', 'susu') THEN amount ELSE 0 END), 0) AS momo_total,
      COALESCE(SUM(amount), 0) AS grand_total,
      COUNT(*) AS total_transactions
    FROM (
      SELECT amount, type FROM momo_transactions WHERE agent_id = ? AND DATE(created_at) = CURDATE()
      UNION ALL
      SELECT amount, type FROM bank_transactions WHERE agent_id = ? AND DATE(created_at) = CURDATE()
    ) AS today
  `;

  db.query(sql, [agentId, agentId], (err, results) => {
    if (err) {
      console.error("Dashboard error:", err);
      return res.status(500).json({ success: false, message: "Stats failed" });
    }

    const s = results[0];
    res.json({
      success: true,
      today: {
        total: Number(s.grand_total || 0),
        momo: Number(s.momo_total || 0),
        bank: Number(s.bank_total || 0),
        transactions: Number(s.total_transactions || 0)
      }
    });
  });
});

module.exports = router;