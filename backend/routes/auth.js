const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// Register
router.post('/register', async (req, res) => {
  const { username, password, account_number, pin } = req.body;
  if (!username || !password || !account_number || !pin) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Check if user exists
    const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (users.length > 0) return res.status(400).json({ error: 'Username already exists' });

    // Check if account number exists
    const [accounts] = await db.query('SELECT * FROM accounts WHERE account_number = ?', [account_number]);
    if (accounts.length > 0) return res.status(400).json({ error: 'Account number already exists' });

    // Hash password and pin
    const passwordHash = await bcrypt.hash(password, 10);
    const pinHash = await bcrypt.hash(pin, 10);

    // Insert user
    const [userResult] = await db.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
    const userId = userResult.insertId;

    // Insert account
    await db.query('INSERT INTO accounts (user_id, account_number, pin_hash, balance) VALUES (?, ?, ?, ?)', [userId, account_number, pinHash, 0.00]);

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (users.length === 0) return res.status(400).json({ error: 'Invalid credentials' });

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    // Get account info
    const [accounts] = await db.query('SELECT account_number, balance, id FROM accounts WHERE user_id = ?', [user.id]);
    const account = accounts[0];

    const payload = {
      user: {
        id: user.id,
        username: user.username,
        accountId: account.id,
        accountNumber: account.account_number
      }
    };

    jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: payload.user });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
