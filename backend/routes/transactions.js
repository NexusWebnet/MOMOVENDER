// backend/routes/transactions.js — FINAL WORKING VERSION (COPY-PASTE THIS EXACTLY)
const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ADMIN - ALL TRANSACTIONS
router.get('/all', (req, res) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const sql = `
    SELECT 
      id, transaction_id, agent_id, agent_name, customer_phone, customer_name,
      amount, type, network, NULL as bank_name, momo_reference, NULL as bank_reference,
      reference_note, status, created_at, 'momo' as source
    FROM momo_transactions 
    WHERE status = 'success'

    UNION ALL

    SELECT 
      id, transaction_id, agent_id, agent_name, customer_account as customer_phone, customer_name,
      amount, type, NULL as network, bank_name, NULL as momo_reference, bank_reference,
      reference_note, status, created_at, 'bank' as source
    FROM bank_transactions 
    WHERE status = 'success'

    ORDER BY created_at DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("ALL TX ERROR:", err);
      return res.status(500).json({ error: 'Server error' });
    }
    res.json(results);
  });
});

// BRANCH - ONLY THEIR BRANCH
router.get('/branch/:branchId', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const branchId = req.params.branchId;
  const userBranchId = req.user.branch_id;

  if (req.user.role !== 'admin' && Number(userBranchId) !== Number(branchId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const sql = `
    SELECT 
      m.id, m.transaction_id, m.agent_id, m.agent_name, m.customer_phone, m.customer_name,
      m.amount, m.type, m.network, NULL as bank_name, m.momo_reference, NULL as bank_reference,
      m.reference_note, m.status, m.created_at, 'momo' as source
    FROM momo_transactions m
    JOIN users u ON m.agent_id = u.id
    WHERE u.branch_id = ? AND m.status = 'success'

    UNION ALL

    SELECT 
      b.id, b.transaction_id, b.agent_id, b.agent_name, b.customer_account as customer_phone, b.customer_name,
      b.amount, b.type, NULL as network, b.bank_name, NULL as momo_reference, b.bank_reference,
      b.reference_note, b.status, b.created_at, 'bank' as source
    FROM bank_transactions b
    JOIN users u ON b.agent_id = u.id
    WHERE u.branch_id = ? AND b.status = 'success'

    ORDER BY created_at DESC
  `;

  db.query(sql, [branchId, branchId], (err, results) => {
    if (err) {
      console.error("BRANCH TX ERROR:", err);
      return res.status(500).json({ error: 'Server error' });
    }
    res.json(results);
  });
});

module.exports = router;