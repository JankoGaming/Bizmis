<<<<<<< Updated upstream
console.log("--- POKREĆEM SERVER (ZMAJEVA JAZBINA) ---");
=======
console.log("--- POKREĆEM SERVER (BEZ MAILINGA + NAPREDNE FUNKCIJE) ---");
>>>>>>> Stashed changes

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

// --- MIDDLEWARE ---
async function isAdmin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: "Niste ulogovani." });
    if (req.session.role === 'admin') { next(); } 
    else {
        const [rows] = await db.query('SELECT role FROM users WHERE id = ?', [req.session.userId]);
        if (rows.length > 0 && rows[0].role === 'admin') { req.session.role = 'admin'; next(); } 
        else { res.status(403).json({ error: "Pristup odbijen." }); }
    }
}

<<<<<<< Updated upstream
// ==============================================
// 1. JAVNE RUTE (SHOP, HOMEPAGE)
// ==============================================
=======
// --- GLAVNE RUTE ---
>>>>>>> Stashed changes

// 1. DOHVATI IGRE (SADA RAČUNA I PRODAJU ZA "BESTSELLER")
app.get('/api/games', async (req, res) => {
    try {
<<<<<<< Updated upstream
        const [rows] = await db.query('SELECT * FROM games ORDER BY rating DESC');
=======
        const query = `
            SELECT g.*, COALESCE(SUM(oi.quantity), 0) as total_sold
            FROM games g
            LEFT JOIN order_items oi ON g.id = oi.game_id
            GROUP BY g.id
            ORDER BY g.rating DESC
        `;
        const [rows] = await db.query(query);
>>>>>>> Stashed changes
        res.json(rows);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

<<<<<<< Updated upstream
// OVO JE FALILO ZA HOMEPAGE
app.get('/api/popular-games', async (req, res) => {
    try {
        const [games] = await db.query('SELECT * FROM games ORDER BY rating DESC LIMIT 4');
        res.json(games);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// OVO JE FALILO ZA BLOGOVE
app.get('/api/blogs', async (req, res) => {
    try { const [rows] = await db.query('SELECT * FROM blogs ORDER BY created_at DESC LIMIT 3'); res.json(rows); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reviews', async (req, res) => {
    try { const [rows] = await db.query('SELECT * FROM reviews ORDER BY created_at DESC LIMIT 3'); res.json(rows); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

// ==============================================
// 2. KORPA I CHECKOUT
// ==============================================

app.post('/api/cart/add', async (req, res) => {
    const { session_id, game_id } = req.body;
    try {
        const [game] = await db.query('SELECT stock_quantity FROM games WHERE id = ?', [game_id]);
        if (game.length === 0 || game[0].stock_quantity <= 0) {
            return res.status(400).json({ error: "Proizvod nije na stanju." });
        }

        const [exists] = await db.query('SELECT * FROM cart_items WHERE session_id = ? AND game_id = ?', [session_id, game_id]);
        if (exists.length > 0) {
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
    try { await db.query('UPDATE cart_items SET quantity = ? WHERE id = ?', [quantity, cart_item_id]); res.json({ success: true }); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

// CHECKOUT SA LOYALTY POENIMA
app.post('/api/checkout', async (req, res) => {
    const { session_id, customer, usePoints } = req.body;
    const user_id = req.session.userId || null;

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const [cartItems] = await connection.query(
            `SELECT c.*, g.price, g.discount_price, g.stock_quantity 
             FROM cart_items c JOIN games g ON c.game_id = g.id 
             WHERE c.session_id = ?`, [session_id]
        );

        if (cartItems.length === 0) {
            await connection.rollback(); connection.release();
            return res.status(400).json({ error: "Korpa je prazna." });
        }

        let total = 0;
        for (const item of cartItems) {
            if (item.quantity > item.stock_quantity) {
                await connection.rollback(); connection.release();
                return res.status(400).json({ error: `Nema dovoljno zaliha za igru ID: ${item.game_id}` });
            }
            const price = item.discount_price || item.price;
            total += price * item.quantity;
        }

        // LOYALTY LOGIKA
        let discountFromPoints = 0;
        let pointsToSpend = 0;

        if (user_id && usePoints) {
            const [userRows] = await connection.query('SELECT points FROM users WHERE id = ?', [user_id]);
            const currentPoints = userRows[0].points;
            if (currentPoints > 0) {
                pointsToSpend = Math.min(currentPoints, total);
                discountFromPoints = pointsToSpend;
                total -= discountFromPoints;
                await connection.query('UPDATE users SET points = points - ? WHERE id = ?', [pointsToSpend, user_id]);
            }
        }

        const [orderResult] = await connection.query(
            `INSERT INTO orders (user_id, full_name, address, city, phone, email, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user_id, customer.fullName, customer.address, customer.city, customer.phone, customer.email, total]
        );
        const orderId = orderResult.insertId;

        for (const item of cartItems) {
            const finalPrice = item.discount_price || item.price;
            await connection.query(
                `INSERT INTO order_items (order_id, game_id, quantity, price_at_purchase) VALUES (?, ?, ?, ?)`,
                [orderId, item.game_id, item.quantity, finalPrice]
            );
            await connection.query(
                `UPDATE games SET stock_quantity = stock_quantity - ? WHERE id = ?`,
                [item.quantity, item.game_id]
            );
        }

        // Dodela novih poena (1%)
        const pointsEarned = user_id ? Math.floor(total / 100) : 0;
        if (pointsEarned > 0) {
            await connection.query('UPDATE users SET points = points + ? WHERE id = ?', [pointsEarned, user_id]);
        }

        await connection.query('DELETE FROM cart_items WHERE session_id = ?', [session_id]);
        await connection.commit();
        connection.release();
        
        res.json({ success: true, message: "Uspešno!", earnedPoints: pointsEarned });

    } catch (error) {
        await connection.rollback(); connection.release();
        console.error(error);
        res.status(500).json({ error: "Greška na serveru." });
    }
});

// RESTOCK REQUEST
app.post('/api/restock-request', async (req, res) => {
    const { email, game_id } = req.body;
    const user_id = req.session.userId || null;
    try {
        await db.query('INSERT INTO restock_requests (user_id, email, game_id) VALUES (?, ?, ?)', [user_id, email, game_id]);
        res.json({ success: true, message: "Obavestićemo vas!" });
    } catch (e) { res.status(500).json({ error: "Greška." }); }
});

// ==============================================
// 3. AUTH (LOGIN / REGISTER)
// ==============================================

app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const [existing] = await db.query('SELECT * FROM users WHERE email = ? OR username = ?', [email, username]);
        if (existing.length > 0) return res.status(400).json({ error: "Korisnik već postoji." });

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword]);
        res.json({ success: true, message: "Uspešna registracija!" });
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
        req.session.role = user.role; 

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

// ==============================================
// 4. ADMIN RUTE
// ==============================================

app.get('/api/admin/stats', isAdmin, async (req, res) => {
    try {
        const [orders] = await db.query('SELECT COUNT(*) as count, SUM(total_price) as revenue FROM orders');
        const [users] = await db.query('SELECT COUNT(*) as count FROM users');
        const [products] = await db.query('SELECT COUNT(*) as count FROM games');
        const [inventory] = await db.query('SELECT SUM(price * stock_quantity) as val FROM games');
        const [recentOrders] = await db.query('SELECT id, full_name, total_price, status, created_at FROM orders ORDER BY created_at DESC LIMIT 5');
        const [lowStock] = await db.query('SELECT id, name, stock_quantity FROM games WHERE stock_quantity < 5 ORDER BY stock_quantity ASC');

        res.json({ 
            ordersCount: orders[0].count, 
            revenue: orders[0].revenue || 0, 
            inventoryValue: inventory[0].val || 0,
            usersCount: users[0].count, 
            productsCount: products[0].count, 
            recentOrders,
            lowStock
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/orders', isAdmin, async (req, res) => {
    try {
        // FIX ZA DUPLIRANJE: GROUP BY
        const query = `
            SELECT o.*, 
            GROUP_CONCAT(CONCAT(g.name, ' x', oi.quantity) SEPARATOR ', ') as items 
            FROM orders o 
            LEFT JOIN order_items oi ON o.id = oi.order_id 
            LEFT JOIN games g ON oi.game_id = g.id 
            GROUP BY o.id 
            ORDER BY o.created_at DESC`;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/orders/:id/status', isAdmin, async (req, res) => {
    try { await db.query('UPDATE orders SET status = ? WHERE id = ?', [req.body.status, req.params.id]); res.json({ success: true }); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

=======
// 2. ADMIN: IZMENA IGRE (NOVO)
app.put('/api/admin/games/:id', isAdmin, async (req, res) => {
    const { name, price, discount_price, stock_quantity, type, description, image_url } = req.body;
    try {
        await db.query(
            `UPDATE games SET name=?, price=?, discount_price=?, stock_quantity=?, type=?, description=?, image_url=? WHERE id=?`,
            [name, price, discount_price || null, stock_quantity, type, description, image_url, req.params.id]
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. ADMIN: DODAVANJE IGRE
>>>>>>> Stashed changes
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

// 4. ADMIN: BRISANJE IGRE
app.delete('/api/admin/games/:id', isAdmin, async (req, res) => {
    try { await db.query('DELETE FROM games WHERE id = ?', [req.params.id]); res.json({ success: true }); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

<<<<<<< Updated upstream
// ADMIN USERS
app.get('/api/admin/users', isAdmin, async (req, res) => {
    try {
        const [users] = await db.query('SELECT id, username, email, role, points, created_at FROM users ORDER BY created_at DESC');
        res.json(users);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/users/:id/points', isAdmin, async (req, res) => {
    const { points } = req.body;
    try {
        await db.query('UPDATE users SET points = ? WHERE id = ?', [points, req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==============================================
// 5. USER PROFIL & WISHLIST
// ==============================================

app.put('/api/user/update', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Niste ulogovani" });
    const { full_name, address, city, zip, phone } = req.body;
    try { await db.query(`UPDATE users SET full_name=?, address=?, city=?, zip=?, phone=? WHERE id=?`, [full_name, address, city, zip, phone, req.session.userId]); res.json({ success: true }); } catch (e) {}
});

app.get('/api/user/details', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Niste ulogovani" });
    try { const [rows] = await db.query('SELECT username, email, full_name, address, city, zip, phone, points FROM users WHERE id = ?', [req.session.userId]); res.json(rows[0]); } catch (e) {}
});

app.get('/api/user/orders', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Niste ulogovani" });
    try { const q = `SELECT o.id, o.total_price, o.status, o.created_at, (SELECT GROUP_CONCAT(CONCAT(g.name, ' (x', oi.quantity, ')') SEPARATOR ', ') FROM order_items oi JOIN games g ON oi.game_id = g.id WHERE oi.order_id = o.id) as items FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC`; const [orders] = await db.query(q, [req.session.userId]); res.json(orders); } catch (e) {}
});

app.post('/api/wishlist/toggle', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Morate biti ulogovani." });
    const { game_id } = req.body;
=======
// --- OSTALE RUTE ---
app.get('/api/popular-games', async (req, res) => {
>>>>>>> Stashed changes
    try {
        const q = `SELECT game_id, COUNT(*) as count FROM cart_items WHERE created_at >= NOW() - INTERVAL 1 MONTH GROUP BY game_id ORDER BY count DESC LIMIT 4`;
        const [popularIds] = await db.query(q);
        if (popularIds.length === 0) { const [top] = await db.query('SELECT * FROM games ORDER BY rating DESC LIMIT 4'); return res.json(top); }
        const ids = popularIds.map(p => p.game_id).join(',');
        const [games] = await db.query(`SELECT * FROM games WHERE id IN (${ids})`);
        res.json(games);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/blogs', async (req, res) => { try { const [r] = await db.query('SELECT * FROM blogs ORDER BY created_at DESC LIMIT 3'); res.json(r); } catch (e) {} });
app.get('/api/reviews', async (req, res) => { try { const [r] = await db.query('SELECT * FROM reviews ORDER BY created_at DESC LIMIT 3'); res.json(r); } catch (e) {} });

// KORPA & CHECKOUT (BEZ MAILINGA)
app.post('/api/cart/add', async (req, res) => {
    const { session_id, game_id } = req.body;
    try {
        const [game] = await db.query('SELECT stock_quantity FROM games WHERE id = ?', [game_id]);
        if (game.length === 0 || game[0].stock_quantity <= 0) return res.status(400).json({ error: "Nema na stanju." });
        const [exists] = await db.query('SELECT * FROM cart_items WHERE session_id = ? AND game_id = ?', [session_id, game_id]);
        if (exists.length > 0) {
            if(exists[0].quantity >= game[0].stock_quantity) return res.status(400).json({ error: "Nema više na stanju." });
            await db.query('UPDATE cart_items SET quantity = quantity + 1 WHERE session_id = ? AND game_id = ?', [session_id, game_id]);
        } else { await db.query('INSERT INTO cart_items (session_id, game_id, quantity) VALUES (?, ?, 1)', [session_id, game_id]); }
        res.json({ message: "Dodato", success: true });
    } catch (e) { res.status(500).json({ error: "Greška" }); }
});

app.get('/api/cart/:session', async (req, res) => {
    try { const q = `SELECT c.id as cart_item_id, c.quantity, g.* FROM cart_items c JOIN games g ON c.game_id = g.id WHERE c.session_id = ?`; const [r] = await db.query(q, [req.params.session]); res.json(r); } catch (e) {}
});
app.delete('/api/cart/remove/:id', async (req, res) => { try { await db.query('DELETE FROM cart_items WHERE id = ?', [req.params.id]); res.json({ success: true }); } catch (e) {} });
app.put('/api/cart/update', async (req, res) => { try { await db.query('UPDATE cart_items SET quantity = ? WHERE id = ?', [req.body.quantity, req.body.cart_item_id]); res.json({ success: true }); } catch (e) {} });

app.post('/api/checkout', async (req, res) => {
    const { session_id, customer } = req.body;
    const user_id = req.session.userId || null; 
    const conn = await db.getConnection(); await conn.beginTransaction();
    try {
        const [cart] = await conn.query(`SELECT c.*, g.price, g.discount_price, g.stock_quantity FROM cart_items c JOIN games g ON c.game_id = g.id WHERE c.session_id = ?`, [session_id]);
        if (cart.length === 0) { await conn.rollback(); return res.status(400).json({ error: "Prazna korpa" }); }
        for (const item of cart) { if (item.quantity > item.stock_quantity) { await conn.rollback(); return res.status(400).json({ error: `Nema dovoljno na stanju za ID: ${item.game_id}` }); } }
        let total = 0; cart.forEach(i => total += (i.discount_price||i.price) * i.quantity);
        const [ord] = await conn.query(`INSERT INTO orders (user_id, full_name, address, city, phone, email, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)`, [user_id, customer.fullName, customer.address, customer.city, customer.phone, customer.email, total]);
        for (const item of cart) {
            await conn.query(`INSERT INTO order_items (order_id, game_id, quantity, price_at_purchase) VALUES (?, ?, ?, ?)`, [ord.insertId, item.game_id, item.quantity, (item.discount_price||item.price)]);
            await conn.query(`UPDATE games SET stock_quantity = stock_quantity - ? WHERE id = ?`, [item.quantity, item.game_id]);
        }
        await conn.query('DELETE FROM cart_items WHERE session_id = ?', [session_id]);
        await conn.commit(); conn.release(); res.json({ success: true });
    } catch (e) { await conn.rollback(); conn.release(); res.status(500).json({ error: e.message }); }
});

// AUTH
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const [ex] = await db.query('SELECT * FROM users WHERE email = ?', [email]); if (ex.length > 0) return res.status(400).json({ error: "Postoji" });
        const h = await bcrypt.hash(password, 10); await db.query('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, h]); res.json({ success: true, promoCode: 'WELCOME15' });
    } catch (e) {}
});
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [u] = await db.query('SELECT * FROM users WHERE email = ?', [email]); if (u.length === 0) return res.status(401).json({ error: "Greška" });
        const m = await bcrypt.compare(password, u[0].password); if (!m) return res.status(401).json({ error: "Greška" });
        req.session.userId = u[0].id; req.session.username = u[0].username; req.session.role = u[0].role;
        res.json({ success: true, role: u[0].role, username: u[0].username });
    } catch (e) {}
});
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/check-auth', (req, res) => { if (req.session.userId) res.json({ loggedIn: true, username: req.session.username, role: req.session.role }); else res.json({ loggedIn: false }); });

// ADMIN PREGLED
app.get('/api/admin/stats', isAdmin, async (req, res) => {
    try {
        const [o] = await db.query('SELECT COUNT(*) as count, SUM(total_price) as revenue FROM orders');
        const [u] = await db.query('SELECT COUNT(*) as count FROM users');
        const [p] = await db.query('SELECT COUNT(*) as count FROM games');
        const [ro] = await db.query('SELECT id, full_name, total_price, status FROM orders ORDER BY created_at DESC LIMIT 5');
        res.json({ ordersCount: o[0].count, revenue: o[0].revenue||0, usersCount: u[0].count, productsCount: p[0].count, recentOrders: ro });
    } catch (e) {}
});
app.get('/api/admin/orders', isAdmin, async (req, res) => { try { const q = `SELECT o.*, (SELECT GROUP_CONCAT(CONCAT(g.name, ' x', oi.quantity) SEPARATOR ', ') FROM order_items oi JOIN games g ON oi.game_id = g.id WHERE oi.order_id = o.id) as items FROM orders o ORDER BY o.created_at DESC`; const [r] = await db.query(q); res.json(r); } catch (e) {} });
app.put('/api/admin/orders/:id/status', isAdmin, async (req, res) => { try { await db.query('UPDATE orders SET status = ? WHERE id = ?', [req.body.status, req.params.id]); res.json({ success: true }); } catch (e) {} });

// PROFIL
app.put('/api/user/update', async (req, res) => { if (!req.session.userId) return; try { await db.query(`UPDATE users SET full_name=?, address=?, city=?, zip=?, phone=? WHERE id=?`, [req.body.full_name, req.body.address, req.body.city, req.body.zip, req.body.phone, req.session.userId]); res.json({ success: true }); } catch (e) {} });
app.get('/api/user/details', async (req, res) => { if (!req.session.userId) return; try { const [r] = await db.query('SELECT * FROM users WHERE id = ?', [req.session.userId]); res.json(r[0]); } catch (e) {} });
app.get('/api/user/orders', async (req, res) => { if (!req.session.userId) return; try { const q = `SELECT o.id, o.total_price, o.status, o.created_at, (SELECT GROUP_CONCAT(CONCAT(g.name, ' (x', oi.quantity, ')') SEPARATOR ', ') FROM order_items oi JOIN games g ON oi.game_id = g.id WHERE oi.order_id = o.id) as items FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC`; const [r] = await db.query(q, [req.session.userId]); res.json(r); } catch (e) {} });
app.get('/api/user/wishlist', async (req, res) => { if (!req.session.userId) return; try { const q = `SELECT g.* FROM wishlist w JOIN games g ON w.game_id = g.id WHERE w.user_id = ?`; const [r] = await db.query(q, [req.session.userId]); res.json(r); } catch (e) {} });
app.get('/api/wishlist/ids', async (req, res) => { if (!req.session.userId) return res.json([]); try { const [r] = await db.query('SELECT game_id FROM wishlist WHERE user_id = ?', [req.session.userId]); res.json(r.map(x => x.game_id)); } catch (e) {} });
app.post('/api/wishlist/toggle', async (req, res) => { if (!req.session.userId) return; const { game_id } = req.body; try { const [ex] = await db.query('SELECT * FROM wishlist WHERE user_id = ? AND game_id = ?', [req.session.userId, game_id]); if (ex.length > 0) { await db.query('DELETE FROM wishlist WHERE user_id = ? AND game_id = ?', [req.session.userId, game_id]); res.json({ success: true, status: 'removed' }); } else { await db.query('INSERT INTO wishlist (user_id, game_id) VALUES (?, ?)', [req.session.userId, game_id]); res.json({ success: true, status: 'added' }); } } catch (e) {} });

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.listen(PORT, () => { console.log(`✅ SERVER RADI: http://localhost:${PORT}`); });