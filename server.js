console.log("--- POKREĆEM SERVER (FINALNA VERZIJA) ---");

const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sesija za login
app.use(session({
    secret: 'super_tajna_sifra_zmajeva_jazbina',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24 sata
}));

// --- 1. RUTE ZA HOMEPAGE ---

// Najpopularnije igre (Bazirano na broju pojavljivanja u korpama u zadnjih 30 dana)
app.get('/api/popular-games', async (req, res) => {
    try {
        // Prvo nalazimo ID-jeve popularnih igara
        const idsQuery = `
            SELECT game_id, COUNT(*) as count 
            FROM cart_items 
            WHERE created_at >= NOW() - INTERVAL 1 MONTH 
            GROUP BY game_id 
            ORDER BY count DESC 
            LIMIT 4
        `;
        const [popularIds] = await db.query(idsQuery);

        if (popularIds.length === 0) {
            // Fallback: Ako nema prodaje, vrati najbolje ocenjene
            const [topRated] = await db.query('SELECT * FROM games ORDER BY rating DESC LIMIT 4');
            return res.json(topRated);
        }

        // Dohvatamo pune podatke za te igre
        const ids = popularIds.map(p => p.game_id).join(',');
        const [games] = await db.query(`SELECT * FROM games WHERE id IN (${ids})`);
        
        res.json(games);
    } catch (error) {
        console.error("Popular games error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Blogovi
app.get('/api/blogs', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM blogs ORDER BY created_at DESC LIMIT 3');
        res.json(rows);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Recenzije
app.get('/api/reviews', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM reviews ORDER BY created_at DESC LIMIT 3');
        res.json(rows);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- 2. AUTH RUTE (LOGIN / REGISTRACIJA) ---

app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const [existing] = await db.query('SELECT * FROM users WHERE email = ? OR username = ?', [email, username]);
        if (existing.length > 0) return res.status(400).json({ error: "Korisnik već postoji." });

        const hashedPassword = await bcrypt.hash(password, 10);
        // Generišemo promo kod
        const promoCode = 'WELCOME' + Math.floor(1000 + Math.random() * 9000);

        await db.query('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword]);
        
        res.json({ success: true, message: "Uspešna registracija!", promoCode: promoCode });
    } catch (error) { res.status(500).json({ error: "Greška na serveru." }); }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(401).json({ error: "Pogrešni podaci." });

        const user = users[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: "Pogrešni podaci." });

        req.session.userId = user.id;
        req.session.username = user.username;
        res.json({ success: true, username: user.username });
    } catch (error) { res.status(500).json({ error: "Greška." }); }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/check-auth', (req, res) => {
    if (req.session.userId) res.json({ loggedIn: true, username: req.session.username });
    else res.json({ loggedIn: false });
});

// --- 3. SHOP I KORPA RUTE ---

app.get('/api/games', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM games ORDER BY rating DESC');
        res.json(rows);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/cart/add', async (req, res) => {
    const { session_id, game_id } = req.body;
    try {
        const [exists] = await db.query('SELECT * FROM cart_items WHERE session_id = ? AND game_id = ?', [session_id, game_id]);
        if (exists.length > 0) {
            await db.query('UPDATE cart_items SET quantity = quantity + 1 WHERE session_id = ? AND game_id = ?', [session_id, game_id]);
        } else {
            await db.query('INSERT INTO cart_items (session_id, game_id, quantity) VALUES (?, ?, 1)', [session_id, game_id]);
        }
        res.json({ message: "Dodato", success: true });
    } catch (error) { res.status(500).json({ error: "Greška" }); }
});

app.get('/api/cart/:session_id', async (req, res) => {
    try {
        const query = `
            SELECT c.id as cart_item_id, c.quantity, g.id as game_id, g.name, g.price, g.discount_price, g.image_url 
            FROM cart_items c 
            JOIN games g ON c.game_id = g.id 
            WHERE c.session_id = ?`;
        const [rows] = await db.query(query, [req.params.session_id]);
        res.json(rows);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/cart/remove/:id', async (req, res) => {
    try { await db.query('DELETE FROM cart_items WHERE id = ?', [req.params.id]); res.json({ success: true }); } 
    catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/cart/update', async (req, res) => {
    const { cart_item_id, quantity } = req.body;
    try { await db.query('UPDATE cart_items SET quantity = ? WHERE id = ?', [quantity, cart_item_id]); res.json({ success: true }); } 
    catch (error) { res.status(500).json({ error: error.message }); }
});

// Catch-all
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✅ SERVER JE POKRENUT! http://localhost:${PORT}`);
});