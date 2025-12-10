console.log("--- POKREĆEM SERVER SA AUTENTIFIKACIJOM ---");

const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt'); // Za kriptovanje lozinki
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Konfiguracija Sesije (Login sistem)
app.use(session({
    secret: 'neka_tajna_sifra_123', // U produkciji ovo ide u .env fajl
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Postavi na true ako koristiš HTTPS
        maxAge: 1000 * 60 * 60 * 24 // Sesija traje 24 sata
    }
}));

// --- AUTH RUTE (LOGIN / REGISTRACIJA) ---

// 1. Registracija
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        // Provera da li korisnik postoji
        const [existing] = await db.query('SELECT * FROM users WHERE email = ? OR username = ?', [email, username]);
        if (existing.length > 0) {
            return res.status(400).json({ error: "Korisnik sa tim emailom ili imenom već postoji." });
        }

        // Kriptovanje lozinke (Hash)
        const hashedPassword = await bcrypt.hash(password, 10);

        // Upis u bazu
        await db.query('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword]);

        res.json({ success: true, message: "Uspešna registracija! Sada se možete ulogovati." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Greška na serveru." });
    }
});

// 2. Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Nađi korisnika
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(401).json({ error: "Pogrešan email ili lozinka." });
        }

        const user = users[0];

        // Proveri lozinku (poredi unetu sa onom u bazi)
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({ error: "Pogrešan email ili lozinka." });
        }

        // Uspešan login - čuvamo podatke u sesiji
        req.session.userId = user.id;
        req.session.username = user.username;

        res.json({ success: true, username: user.username });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Greška na serveru." });
    }
});

// 3. Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// 4. Proveri ko je ulogovan (za frontend)
app.get('/api/check-auth', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, username: req.session.username });
    } else {
        res.json({ loggedIn: false });
    }
});

// --- OSTALE RUTE (GAMES & CART) ---

app.get('/api/games', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM games ORDER BY rating DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Korpa rute (iste kao pre)
app.post('/api/cart/add', async (req, res) => {
    const { session_id, game_id } = req.body;
    try {
        const [exists] = await db.query('SELECT * FROM cart_items WHERE session_id = ? AND game_id = ?', [session_id, game_id]);
        if (exists.length > 0) {
            await db.query('UPDATE cart_items SET quantity = quantity + 1 WHERE session_id = ? AND game_id = ?', [session_id, game_id]);
        } else {
            await db.query('INSERT INTO cart_items (session_id, game_id, quantity) VALUES (?, ?, 1)', [session_id, game_id]);
        }
        res.json({ message: "Uspešno dodato", success: true });
    } catch (error) {
        res.status(500).json({ error: "Greška pri dodavanju u korpu" });
    }
});

app.get('/api/cart/:session_id', async (req, res) => {
    try {
        const query = `SELECT c.id as cart_item_id, c.quantity, g.id as game_id, g.name, g.price, g.image_url FROM cart_items c JOIN games g ON c.game_id = g.id WHERE c.session_id = ?`;
        const [rows] = await db.query(query, [req.params.session_id]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/cart/remove/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM cart_items WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/cart/update', async (req, res) => {
    const { cart_item_id, quantity } = req.body;
    try {
        await db.query('UPDATE cart_items SET quantity = ? WHERE id = ?', [quantity, cart_item_id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✅ SERVER RADI NA http://localhost:${PORT}`);
});