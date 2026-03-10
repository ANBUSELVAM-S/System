const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');

// Middleware to verify token
const authMiddleware = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) return res.status(401).json({ error: 'No token, authorization denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is not valid' });
  }
};

// Get Balance
router.get('/balance', authMiddleware, async (req, res) => {
  try {
    const [accounts] = await db.query('SELECT balance FROM accounts WHERE id = ?', [req.user.accountId]);
    if (accounts.length === 0) return res.status(404).json({ error: 'Account not found' });
    res.json({ balance: accounts[0].balance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get Transactions
router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    const [transactions] = await db.query('SELECT * FROM transactions WHERE account_id = ? ORDER BY timestamp DESC', [req.user.accountId]);
    res.json(transactions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Transfer Funds internally (Optional addition for web)
router.post('/transfer', authMiddleware, async (req, res) => {
  const { recipient_account_number, amount } = req.body;
  if (!recipient_account_number || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid transfer details' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Check balance
    const [senderAccounts] = await connection.query('SELECT balance FROM accounts WHERE id = ? FOR UPDATE', [req.user.accountId]);
    if (senderAccounts[0].balance < amount) {
      throw new Error('Insufficient funds');
    }

    // Check recipient
    const [recipientAccounts] = await connection.query('SELECT id FROM accounts WHERE account_number = ? FOR UPDATE', [recipient_account_number]);
    if (recipientAccounts.length === 0) {
      throw new Error('Recipient not found');
    }

    const recipientId = recipientAccounts[0].id;

    // Deduct
    await connection.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [amount, req.user.accountId]);
    // Add
    await connection.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [amount, recipientId]);

    // Record transactions
    await connection.query('INSERT INTO transactions (account_id, type, amount) VALUES (?, ?, ?)', [req.user.accountId, 'transfer', -amount]);
    await connection.query('INSERT INTO transactions (account_id, type, amount) VALUES (?, ?, ?)', [recipientId, 'transfer', amount]);

    await connection.commit();
    res.json({ message: 'Transfer successful' });
  } catch (err) {
    await connection.rollback();
    res.status(400).json({ error: err.message || 'Server error' });
  } finally {
    connection.release();
  }
});

module.exports = router;
