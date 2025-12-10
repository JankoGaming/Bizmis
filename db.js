const mysql = require('mysql2');
require('dotenv').config();

console.log("--- 1. INICIJALIZACIJA POVEZIVANJA SA BAZOM ---");

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    
    // 👇👇👇 TVOJA LOZINKA OVDE 👇👇👇
    // Ako je tvoja lozinka 1234, napiši: password: '1234',
    // Ako je nemaš, ostavi prazno ovako: password: '',
    // Ako je nisi menjao pri instalaciji, možda je 'root'.
    password: process.env.DB_PASSWORD || 'root', 

    // 👇 IME SCHEME (Potvrdio si da je board_games)
    database: process.env.DB_NAME || 'board_games',
    
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// TEST KONEKCIJE
pool.getConnection((err, connection) => {
    if (err) {
        console.error("\n❌❌❌ GREŠKA PRI POVEZIVANJU NA BAZU ❌❌❌");
        console.error("Kod greške:", err.code);
        console.error("Poruka:", err.sqlMessage);
        
        if (err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error("👉 SAVET: Lozinka u db.js fajlu nije tačna.");
        } 
        else if (err.code === 'ER_BAD_DB_ERROR') {
            console.error("👉 SAVET: Baza (Schema) 'board_games' ne postoji u Workbenchu.");
        }
        else if (err.code === 'ECONNREFUSED') {
            console.error("👉 SAVET: MySQL Server nije uključen (Services -> MySQL80).");
        }
    } else {
        console.log("\n✅✅✅ USPEH! Povezan si na bazu 'board_games'! ✅✅✅");
        connection.release();
    }
});

const promisePool = pool.promise();

module.exports = promisePool;