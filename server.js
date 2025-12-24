console.log("--- POKREĆEM SERVER (STOCK MANAGEMENT) ---");

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
app.use(session({
    secret: 'super_tajna_sifra_zmajeva_jazbina',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } 
}));

// --- MIDDLEWARE ZA ADMINA ---
async function isAdmin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: "Niste ulogovani." });
    if (req.session.role === 'admin') {
        next();
    } else {
        const [rows] = await db.query('SELECT role FROM users WHERE id = ?', [req.session.userId]);
        if (rows.length > 0 && rows[0].role === 'admin') {
            req.session.role = 'admin';
            next();
        } else {
            res.status(403).json({ error: "Pristup odbijen." });
        }
    }
}

// --- RUTE ZA PRODAVNICU ---

app.get('/api/games', async (req, res) => {
    try {
        // Vraćamo i stock_quantity
        const [rows] = await db.query('SELECT * FROM games ORDER BY rating DESC');
        res.json(rows);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/popular-games', async (req, res) => {
    try {
        const [games] = await db.query('SELECT * FROM games ORDER BY rating DESC LIMIT 4');
        res.json(games);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/blogs', async (req, res) => {
    try { const [rows] = await db.query('SELECT * FROM blogs ORDER BY created_at DESC LIMIT 3'); res.json(rows); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reviews', async (req, res) => {
    try { const [rows] = await db.query('SELECT * FROM reviews ORDER BY created_at DESC LIMIT 3'); res.json(rows); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

// --- RUTE ZA KORPU I CHECKOUT (SA PROVEROM STANJA) ---

app.post('/api/cart/add', async (req, res) => {
    const { session_id, game_id } = req.body;
    try {
        // Provera stanja pre dodavanja
        const [game] = await db.query('SELECT stock_quantity FROM games WHERE id = ?', [game_id]);
        if (game.length === 0 || game[0].stock_quantity <= 0) {
            return res.status(400).json({ error: "Proizvod nije na stanju." });
        }

        const [exists] = await db.query('SELECT * FROM cart_items WHERE session_id = ? AND game_id = ?', [session_id, game_id]);
        if (exists.length > 0) {
            // Provera da li ima dovoljno za povećanje
            if (exists[0].quantity >= game[0].stock_quantity) {
                return res.status(400).json({ error: "Nema više na stanju." });
            }
            await db.query('UPDATE cart_items SET quantity = quantity + 1 WHERE session_id = ? AND game_id = ?', [session_id, game_id]);
        } else {
            await db.query('INSERT INTO cart_items (session_id, game_id, quantity) VALUES (?, ?, 1)', [session_id, game_id]);
        }
        res.json({ message: "Dodato", success: true });
    } catch (e) { res.status(500).json({ error: "Greška" }); }
});

app.get('/api/cart/:session_id', async (req, res) => {
    try {
        const query = `
            SELECT c.id as cart_item_id, c.quantity, g.id as game_id, g.name, g.price, g.discount_price, g.image_url, g.stock_quantity 
            FROM cart_items c 
            JOIN games g ON c.game_id = g.id 
            WHERE c.session_id = ?`;
        const [rows] = await db.query(query, [req.params.session_id]);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/cart/remove/:id', async (req, res) => {
    try { await db.query('DELETE FROM cart_items WHERE id = ?', [req.params.id]); res.json({ success: true }); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/cart/update', async (req, res) => {
    const { cart_item_id, quantity } = req.body;
    try { 
        // Ovde bi trebala i provera stanja, ali za sad verujemo frontend validaciji ili checkoutu
        await db.query('UPDATE cart_items SET quantity = ? WHERE id = ?', [quantity, cart_item_id]); 
        res.json({ success: true }); 
    } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

// CHECKOUT - SMANJUJE STANJE
app.post('/api/checkout', async (req, res) => {
    const { session_id, customer } = req.body;
    const user_id = req.session.userId || null; 

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const [cartItems] = await connection.query(
            `SELECT c.*, g.price, g.discount_price, g.stock_quantity 
             FROM cart_items c 
             JOIN games g ON c.game_id = g.id 
             WHERE c.session_id = ?`, 
            [session_id]
        );

        if (cartItems.length === 0) {
            await connection.rollback();
            return res.status(400).json({ error: "Korpa je prazna." });
        }

        // Provera stanja
        for (const item of cartItems) {
            if (item.quantity > item.stock_quantity) {
                await connection.rollback();
                return res.status(400).json({ error: `Nema dovoljno na stanju za igru ID: ${item.game_id}` });
            }
        }

        let total = 0;
        cartItems.forEach(item => {
            const price = item.discount_price || item.price;
            total += price * item.quantity;
        });

        const [orderResult] = await connection.query(
            `INSERT INTO orders (user_id, full_name, address, city, phone, email, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user_id, customer.fullName, customer.address, customer.city, customer.phone, customer.email, total]
        );
        const orderId = orderResult.insertId;

        for (const item of cartItems) {
            const finalPrice = item.discount_price || item.price;
            
            // Ubaci u narudžbinu
            await connection.query(
                `INSERT INTO order_items (order_id, game_id, quantity, price_at_purchase) VALUES (?, ?, ?, ?)`,
                [orderId, item.game_id, item.quantity, finalPrice]
            );

            // Smanji stanje
            await connection.query(
                `UPDATE games SET stock_quantity = stock_quantity - ? WHERE id = ?`,
                [item.quantity, item.game_id]
            );
        }

        await connection.query('DELETE FROM cart_items WHERE session_id = ?', [session_id]);
        await connection.commit();
        connection.release();
        
        res.json({ success: true, orderId: orderId, message: "Narudžbina uspešna!" });

    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error("Checkout greška:", error);
        res.status(500).json({ error: "Greška prilikom naručivanja." });
    }
});

// --- AUTH RUTE ---

app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const [existing] = await db.query('SELECT * FROM users WHERE email = ? OR username = ?', [email, username]);
        if (existing.length > 0) return res.status(400).json({ error: "Korisnik već postoji." });

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword]);
        res.json({ success: true, message: "Uspešna registracija!", promoCode: 'WELCOME15' });
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
        req.session.role = user.role; // Čuvamo ulogu

        res.json({ success: true, username: user.username, role: user.role });
    } catch (error) { res.status(500).json({ error: "Greška." }); }
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

app.get('/api/check-auth', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, username: req.session.username, role: req.session.role });
    } else {
        res.json({ loggedIn: false });
    }
});

// --- ADMIN RUTE ---
app.get('/api/admin/stats', isAdmin, async (req, res) => {
    try {
        const [orders] = await db.query('SELECT COUNT(*) as count, SUM(total_price) as revenue FROM orders');
        const [users] = await db.query('SELECT COUNT(*) as count FROM users');
        const [products] = await db.query('SELECT COUNT(*) as count FROM games');
        const [recentOrders] = await db.query('SELECT id, full_name, total_price, status, created_at FROM orders ORDER BY created_at DESC LIMIT 5');
        res.json({ ordersCount: orders[0].count, revenue: orders[0].revenue || 0, usersCount: users[0].count, productsCount: products[0].count, recentOrders });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/orders', isAdmin, async (req, res) => {
    try {
        const query = `SELECT o.*, (SELECT GROUP_CONCAT(CONCAT(g.name, ' x', oi.quantity) SEPARATOR ', ') FROM order_items oi JOIN games g ON oi.game_id = g.id WHERE oi.order_id = o.id) as items FROM orders o ORDER BY o.created_at DESC`;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/orders/:id/status', isAdmin, async (req, res) => {
    try { await db.query('UPDATE orders SET status = ? WHERE id = ?', [req.body.status, req.params.id]); res.json({ success: true }); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/games', isAdmin, async (req, res) => {
    const { name, price, type, image_url, description, stock_quantity } = req.body;
    try { 
        await db.query(
            'INSERT INTO games (name, price, type, image_url, description, rating, stock_quantity) VALUES (?, ?, ?, ?, ?, 5.0, ?)', 
            [name, price, type, image_url, description, stock_quantity || 10]
        ); 
        res.json({ success: true }); 
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/games/:id', isAdmin, async (req, res) => {
    try { await db.query('DELETE FROM games WHERE id = ?', [req.params.id]); res.json({ success: true }); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

// --- RUTE ZA PROFIL & WISHLIST ---
app.put('/api/user/update', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Niste ulogovani" });
    const { full_name, address, city, zip, phone } = req.body;
    try { await db.query(`UPDATE users SET full_name=?, address=?, city=?, zip=?, phone=? WHERE id=?`, [full_name, address, city, zip, phone, req.session.userId]); res.json({ success: true }); } catch (e) {}
});

app.get('/api/user/details', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Niste ulogovani" });
    try { const [rows] = await db.query('SELECT username, email, full_name, address, city, zip, phone FROM users WHERE id = ?', [req.session.userId]); res.json(rows[0]); } catch (e) {}
});

app.get('/api/user/orders', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Niste ulogovani" });
    try { const q = `SELECT o.id, o.total_price, o.status, o.created_at, (SELECT GROUP_CONCAT(CONCAT(g.name, ' (x', oi.quantity, ')') SEPARATOR ', ') FROM order_items oi JOIN games g ON oi.game_id = g.id WHERE oi.order_id = o.id) as items FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC`; const [orders] = await db.query(q, [req.session.userId]); res.json(orders); } catch (e) {}
});

app.post('/api/wishlist/toggle', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Morate biti ulogovani." });
    const { game_id } = req.body;
    try {
        const [exists] = await db.query('SELECT * FROM wishlist WHERE user_id = ? AND game_id = ?', [req.session.userId, game_id]);
        if (exists.length > 0) { await db.query('DELETE FROM wishlist WHERE user_id = ? AND game_id = ?', [req.session.userId, game_id]); res.json({ success: true, status: 'removed' }); }
        else { await db.query('INSERT INTO wishlist (user_id, game_id) VALUES (?, ?)', [req.session.userId, game_id]); res.json({ success: true, status: 'added' }); }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/wishlist/ids', async (req, res) => {
    if (!req.session.userId) return res.json([]); 
    try { const [rows] = await db.query('SELECT game_id FROM wishlist WHERE user_id = ?', [req.session.userId]); res.json(rows.map(r => r.game_id)); } catch (e) {}
});

app.get('/api/user/wishlist', async (req, res) => {
    if (!req.session.userId) return res.json([]);
    try { const q = `SELECT g.* FROM wishlist w JOIN games g ON w.game_id = g.id WHERE w.user_id = ?`; const [rows] = await db.query(q, [req.session.userId]); res.json(rows); } catch (e) {}
});

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

app.listen(PORT, () => { console.log(`✅ SERVER: http://localhost:${PORT}`); });