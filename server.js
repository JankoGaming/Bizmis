console.log("--- 2. POKREĆEM SERVER SKRIPTU ---");

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db'); // Uvozimo konekciju iz db.js

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serviranje statičkih fajlova (HTML, CSS, JS) iz foldera 'public'
app.use(express.static(path.join(__dirname, 'public')));

// --- API RUTE ---

// 1. Dohvati sve igre
app.get('/api/games', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM games ORDER BY rating DESC');
        res.json(rows);
    } catch (error) {
        console.error("Greška pri dohvatanju igara:", error);
        res.status(500).json({ error: "Greška na serveru: " + error.message });
    }
});

// 2. Dohvati jednu igru po ID-u
app.get('/api/games/:id', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM games WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: "Igra nije pronađena" });
        res.json(rows[0]);
    } catch (error) {
        console.error("Greška:", error);
        res.status(500).json({ error: "Greška na serveru" });
    }
});

// Catch-all ruta
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start servera
app.listen(PORT, () => {
    console.log(`✅ SERVER JE POKRENUT!`);
    console.log(`👉 Otvori u browseru: http://localhost:${PORT}`);
});