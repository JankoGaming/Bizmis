const mysql = require('mysql2');
require('dotenv').config();

console.log("--- KONEKCIJA KA BAZI ---");

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    
    // 👇 TVOJA LOZINKA OVDE (ako je root, ostavi root)
    password: process.env.DB_PASSWORD || 'root', 

    database: process.env.DB_NAME || 'board_games',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// 👇 OVO JE KLJUČNO! Ovo omogućava da koristimo 'await db.query' u server.js
// Ako ovo fali, dobijaš grešku "db.query is not a function"
module.exports = pool.promise();