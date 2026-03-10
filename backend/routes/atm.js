const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// ATM Verify PIN
router.post('/verify-pin', async (req, res) => {
  const { account_number, pin } = req.body;
  
  if (!account_number || !pin) {
    return res.status(400).json({ error: 'Account number and PIN required' });
  }

  try {
    const [accounts] = await db.query(
      'SELECT a.*, u.username FROM accounts a JOIN users u ON a.user_id = u.id WHERE a.account_number = ?',
      [account_number]
    );

    if (accounts.length === 0) return res.status(400).json({ error: 'Invalid account number or PIN' });

    const account = accounts[0];
    const isMatch = await bcrypt.compare(pin, account.pin_hash);
    
    if (!isMatch) return res.status(400).json({ error: 'Invalid account number or PIN' });

    const payload = {
      user: {
        id: account.user_id,
        username: account.username,
        accountId: account.id,
        accountNumber: account.account_number
      }
    };

    jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '15m' }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: payload.user, message: 'PIN verified' });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ATM Middleware
const atmAuth = (req, res, next) => {
  const token = req.header('x-atm-token');
  if (!token) return res.status(401).json({ error: 'Session expired. Please re-enter PIN.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Session expired. Please re-enter PIN.' });
  }
};

// Cash Withdrawal
router.post('/withdraw', atmAuth, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0 || amount % 10 !== 0) {
    return res.status(400).json({ error: 'Invalid amount. Must be positive and multiple of 10' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [accounts] = await connection.query('SELECT balance FROM accounts WHERE id = ? FOR UPDATE', [req.user.accountId]);
    if (accounts[0].balance < amount) {
      throw new Error('Insufficient funds');
    }

    await connection.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [amount, req.user.accountId]);
    await connection.query('INSERT INTO transactions (account_id, type, amount) VALUES (?, ?, ?)', [req.user.accountId, 'withdrawal', amount]);

    await connection.commit();
    res.json({ message: 'Please take your cash', balance: accounts[0].balance - amount });
  } catch (err) {
    await connection.rollback();
    res.status(400).json({ error: err.message || 'Server error' });
  } finally {
    connection.release();
  }
});

// Cash Deposit
router.post('/deposit', atmAuth, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [amount, req.user.accountId]);
    await connection.query('INSERT INTO transactions (account_id, type, amount) VALUES (?, ?, ?)', [req.user.accountId, 'deposit', amount]);

    const [accounts] = await connection.query('SELECT balance FROM accounts WHERE id = ?', [req.user.accountId]);

    await connection.commit();
    res.json({ message: 'Cash accepted', balance: accounts[0].balance });
  } catch (err) {
    await connection.rollback();
    res.status(400).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
});

module.exports = router;
