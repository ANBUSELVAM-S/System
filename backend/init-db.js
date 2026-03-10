const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initDB() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true
    });

    console.log('Connected to MySQL server. Executing setup.sql...');
    const sqlPath = path.join(__dirname, '..', 'setup.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await connection.query(sql);
    console.log('Database and tables created successfully.');
    await connection.end();
  } catch (error) {
    console.error('Error initializing database. Ensure MySQL is running on localhost with root access, or provide .env file credentials.');
    console.error(error.message);
    process.exit(1);
  }
}

initDB();
