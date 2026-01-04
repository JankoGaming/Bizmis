console.log("--- POKREĆEM SERVER (ZMAJEVA JAZBINA) ---");

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
    if (req.session.role === 'admin') { next(); } 
    else {
        try {
            const [rows] = await db.query('SELECT role FROM users WHERE id = ?', [req.session.userId]);
            if (rows.length > 0 && rows[0].role === 'admin') { req.session.role = 'admin'; next(); } 
            else { res.status(403).json({ error: "Pristup odbijen." }); }
        } catch (e) { res.status(500).json({ error: "Greška." }); }
    }
}

// 1. SETUP RUTA
app.get('/setup-admin', async (req, res) => {
    try {
        const email = 'neka@email.adresa';
        const password = 'user12345';
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = `INSERT INTO users (username, email, password, role) VALUES ('Admin', ?, ?, 'admin') ON DUPLICATE KEY UPDATE password = ?, role = 'admin'`;
        await db.query(query, [email, hashedPassword, hashedPassword]);
        res.send(`Admin kreiran! Email: ${email}, Pass: ${password}`);
    } catch (e) { res.send("Greška: " + e.message); }
});

// 2. JAVNE RUTE
app.get('/api/games', async (req, res) => {
    try { const [rows] = await db.query('SELECT * FROM games ORDER BY rating DESC'); res.json(rows); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/popular-games', async (req, res) => {
    try { const [results] = await db.query("SELECT * FROM games ORDER BY rating DESC LIMIT 4"); res.json(results); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/blogs', async (req, res) => {
    try { const [rows] = await db.query('SELECT * FROM blogs ORDER BY created_at DESC'); res.json(rows); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/recent-reviews', async (req, res) => {
    try { const [results] = await db.query("SELECT * FROM reviews ORDER BY created_at DESC LIMIT 3"); res.json(results); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. ADMIN RUTE (STATISTIKA, IGRE, BLOGOVI)

app.get('/api/admin/stats', isAdmin, async (req, res) => {
    try {
        const [orders] = await db.query('SELECT COUNT(*) as count, IFNULL(SUM(total_price), 0) as revenue FROM orders');
        const [users] = await db.query('SELECT COUNT(*) as count FROM users');
        const [products] = await db.query('SELECT COUNT(*) as count FROM games');
        const [inventory] = await db.query('SELECT IFNULL(SUM(price * stock_quantity), 0) as val FROM games');
        
        // Ovo je ključno za kritične zalihe
        const [lowStock] = await db.query('SELECT id, name, stock_quantity FROM games WHERE stock_quantity < 5 ORDER BY stock_quantity ASC');
        
        const [recentOrders] = await db.query('SELECT id, full_name, total_price, status, created_at FROM orders ORDER BY created_at DESC LIMIT 5');

        res.json({ 
            ordersCount: orders[0].count, 
            revenue: orders[0].revenue, 
            inventoryValue: inventory[0].val,
            usersCount: users[0].count, 
            productsCount: products[0].count, 
            recentOrders,
            lowStock // Šaljemo podatke frontendu
        });
    } catch (e) { 
        console.error("Greška stats:", e);
        res.status(500).json({ error: e.message }); 
    }
});

// --- ADMIN: IGRE (CRUD + POPUSTI) ---
app.get('/api/admin/games', isAdmin, async (req, res) => {
    try { const [games] = await db.query('SELECT * FROM games ORDER BY id DESC'); res.json(games); } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/admin/games', isAdmin, async (req, res) => {
    const { name, price, stock_quantity, type, image_url, description, discount_price } = req.body;
    const finalDiscount = (discount_price && discount_price > 0) ? discount_price : null;
    try { 
        await db.query(
            'INSERT INTO games (name, price, discount_price, stock_quantity, type, image_url, description, rating) VALUES (?, ?, ?, ?, ?, ?, ?, 5.0)', 
            [name, price, finalDiscount, stock_quantity || 10, type, image_url, description]
        ); 
        res.json({ success: true }); 
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// EDIT IGRE (UPDATE)
app.put('/api/admin/games/:id', isAdmin, async (req, res) => {
    const { name, price, discount_price, stock_quantity, type, image_url, description } = req.body;
    const finalDiscount = (discount_price && discount_price > 0) ? discount_price : null;
    try {
        await db.query(
            'UPDATE games SET name=?, price=?, discount_price=?, stock_quantity=?, type=?, image_url=?, description=? WHERE id=?',
            [name, price, finalDiscount, stock_quantity, type, image_url, description, req.params.id]
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/games/:id', isAdmin, async (req, res) => {
    try { await db.query('DELETE FROM games WHERE id = ?', [req.params.id]); res.json({ success: true }); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ADMIN: BLOGOVI (NOVO) ---
app.post('/api/admin/blogs', isAdmin, async (req, res) => {
    const { title, excerpt, image_url } = req.body;
    try {
        await db.query('INSERT INTO blogs (title, excerpt, image_url) VALUES (?, ?, ?)', [title, excerpt, image_url]);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/blogs/:id', isAdmin, async (req, res) => {
    try { await db.query('DELETE FROM blogs WHERE id = ?', [req.params.id]); res.json({ success: true }); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ADMIN: ORDERS & USERS ---
app.get('/api/admin/orders', isAdmin, async (req, res) => {
    try {
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

app.get('/api/admin/users', isAdmin, async (req, res) => {
    try { const [users] = await db.query('SELECT id, username, email, role, points, created_at FROM users ORDER BY created_at DESC'); res.json(users); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/users/:id/points', isAdmin, async (req, res) => {
    try { await db.query('UPDATE users SET points = ? WHERE id = ?', [req.body.points, req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. OSTALO (Auth, Cart, itd.) - Zadržana stara logika
app.post('/api/cart/add', async (req, res) => { /* ... */ 
    const { session_id, game_id } = req.body;
    try {
        const [game] = await db.query('SELECT stock_quantity FROM games WHERE id = ?', [game_id]);
        if (game.length === 0 || game[0].stock_quantity <= 0) return res.status(400).json({ error: "Nema na stanju." });
        const [exists] = await db.query('SELECT * FROM cart_items WHERE session_id = ? AND game_id = ?', [session_id, game_id]);
        if (exists.length > 0) {
            if (exists[0].quantity >= game[0].stock_quantity) return res.status(400).json({ error: "Nema više na stanju." });
            await db.query('UPDATE cart_items SET quantity = quantity + 1 WHERE session_id = ? AND game_id = ?', [session_id, game_id]);
        } else { await db.query('INSERT INTO cart_items (session_id, game_id, quantity) VALUES (?, ?, 1)', [session_id, game_id]); }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Greška" }); }
});
app.get('/api/cart/:session_id', async (req, res) => { try { const q = `SELECT c.id as cart_item_id, c.quantity, g.* FROM cart_items c JOIN games g ON c.game_id = g.id WHERE c.session_id = ?`; const [rows] = await db.query(q, [req.params.session_id]); res.json(rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/cart/remove/:id', async (req, res) => { try { await db.query('DELETE FROM cart_items WHERE id = ?', [req.params.id]); res.json({ success: true }); } catch (e) {} });
app.put('/api/cart/update', async (req, res) => { try { await db.query('UPDATE cart_items SET quantity = ? WHERE id = ?', [req.body.quantity, req.body.cart_item_id]); res.json({ success: true }); } catch (e) {} });
app.post('/api/checkout', async (req, res) => { 
    const { session_id, customer, usePoints } = req.body; const user_id = req.session.userId || null; const connection = await db.getConnection(); await connection.beginTransaction();
    try {
        const [cartItems] = await connection.query(`SELECT c.*, g.price, g.discount_price, g.stock_quantity FROM cart_items c JOIN games g ON c.game_id = g.id WHERE c.session_id = ?`, [session_id]);
        if (cartItems.length === 0) { await connection.rollback(); connection.release(); return res.status(400).json({ error: "Prazna korpa" }); }
        let total = 0;
        for (const item of cartItems) {
            if (item.quantity > item.stock_quantity) { await connection.rollback(); connection.release(); return res.status(400).json({ error: `Nema zaliha za ID: ${item.game_id}` }); }
            total += (item.discount_price || item.price) * item.quantity;
        }
        if (user_id && usePoints) {
            const [u] = await connection.query('SELECT points FROM users WHERE id = ?', [user_id]);
            const discount = Math.min(u[0].points, total);
            total -= discount;
            await connection.query('UPDATE users SET points = points - ? WHERE id = ?', [discount, user_id]);
        }
        const [ord] = await connection.query(`INSERT INTO orders (user_id, full_name, address, city, phone, email, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)`, [user_id, customer.fullName, customer.address, customer.city, customer.phone, customer.email, total]);
        for (const item of cartItems) {
            await connection.query(`INSERT INTO order_items (order_id, game_id, quantity, price_at_purchase) VALUES (?, ?, ?, ?)`, [ord.insertId, item.game_id, item.quantity, (item.discount_price||item.price)]);
            await connection.query(`UPDATE games SET stock_quantity = stock_quantity - ? WHERE id = ?`, [item.quantity, item.game_id]);
        }
        const pointsEarned = user_id ? Math.floor(total / 100) : 0;
        if (pointsEarned > 0) await connection.query('UPDATE users SET points = points + ? WHERE id = ?', [pointsEarned, user_id]);
        await connection.query('DELETE FROM cart_items WHERE session_id = ?', [session_id]);
        await connection.commit(); connection.release(); res.json({ success: true, earnedPoints: pointsEarned });
    } catch (e) { await connection.rollback(); connection.release(); res.status(500).json({ error: "Greška" }); }
});
app.post('/api/restock-request', async (req, res) => { try { await db.query('INSERT INTO restock_requests (user_id, email, game_id) VALUES (?, ?, ?)', [req.session.userId || null, req.body.email, req.body.game_id]); res.json({ success: true }); } catch (e) {} });
app.post('/api/register', async (req, res) => { try { const h = await bcrypt.hash(req.body.password, 10); await db.query('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, "user")', [req.body.username, req.body.email, h]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: "Greška" }); } });
app.post('/api/login', async (req, res) => { try { const [u] = await db.query('SELECT * FROM users WHERE email = ?', [req.body.email]); if (u.length === 0 || !(await bcrypt.compare(req.body.password, u[0].password))) return res.status(401).json({ error: "Pogrešni podaci" }); req.session.userId = u[0].id; req.session.role = u[0].role; req.session.username = u[0].username; res.json({ success: true, role: u[0].role, username: u[0].username }); } catch (e) { res.status(500).json({ error: "Greška" }); } });
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/check-auth', (req, res) => { if(req.session.userId) res.json({ loggedIn: true, username: req.session.username, role: req.session.role }); else res.json({ loggedIn: false }); });
app.get('/api/user/details', async (req, res) => { if(!req.session.userId) return; const [r] = await db.query('SELECT * FROM users WHERE id = ?', [req.session.userId]); res.json(r[0]); });
app.get('/api/user/wishlist', async (req, res) => { if(!req.session.userId) return; const [r] = await db.query('SELECT g.* FROM wishlist w JOIN games g ON w.game_id = g.id WHERE w.user_id = ?', [req.session.userId]); res.json(r); });
app.get('/api/wishlist/ids', async (req, res) => { if(!req.session.userId) return res.json([]); const [r] = await db.query('SELECT game_id FROM wishlist WHERE user_id = ?', [req.session.userId]); res.json(r.map(x => x.game_id)); });
app.post('/api/wishlist/toggle', async (req, res) => { if(!req.session.userId) return res.status(401).json({error: "Login required"}); const {game_id} = req.body; const [ex] = await db.query('SELECT * FROM wishlist WHERE user_id=? AND game_id=?', [req.session.userId, game_id]); if(ex.length > 0) { await db.query('DELETE FROM wishlist WHERE user_id=? AND game_id=?', [req.session.userId, game_id]); res.json({success:true, status:'removed'}); } else { await db.query('INSERT INTO wishlist (user_id, game_id) VALUES (?,?)', [req.session.userId, game_id]); res.json({success:true, status:'added'}); } });

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.listen(PORT, () => { console.log(`✅ SERVER RADI: http://localhost:${PORT}`); });