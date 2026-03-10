const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes will be imported here
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/accounts');
const atmRoutes = require('./routes/atm');

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/atm', atmRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Banking Server is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
