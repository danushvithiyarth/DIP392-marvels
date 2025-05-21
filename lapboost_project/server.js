const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();
const db = new sqlite3.Database('./database.db');

app.use(session({
  secret: 'lapboost_secret_key',
  resave: false,
  saveUninitialized: true
}));

app.use(bodyParser.json());
app.use(express.static('public'));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    user_id INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    product_name TEXT,
    status TEXT,
    created_at TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT,
    price REAL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS cart (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    user_id INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sell_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT,
    description TEXT,
    price REAL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS service_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT,
    status TEXT DEFAULT 'pending'
  )`);
});

app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products', (err, rows) => res.json(rows));
});

app.post('/api/products', (req, res) => {
  if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Access Denied' });

  const { name, price } = req.body;
  db.run(`INSERT INTO products (name, price) VALUES (?, ?)`, [name, price], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to add product' });
    res.json({ success: true, id: this.lastID });
  });
});

app.delete('/api/products/:id', (req, res) => {
  if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Access Denied' });

  db.run(`DELETE FROM products WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to delete product' });
    res.json({ success: true });
  });
});

app.post('/api/cart', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });

  const { product_id } = req.body;
  db.run(`INSERT INTO cart (product_id, user_id) VALUES (?, ?)`, [product_id, req.session.userId], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to add to cart' });
    res.json({ success: true, id: this.lastID });
  });
});

app.get('/api/cart', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });

  db.all(`SELECT cart.id, products.name, products.price FROM cart 
          JOIN products ON cart.product_id = products.id 
          WHERE cart.user_id = ?`, [req.session.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to load cart' });
    res.json(rows);
  });
});

app.post('/api/checkout', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });

  const timestamp = new Date().toISOString();

  db.all(`SELECT products.name FROM cart 
          JOIN products ON cart.product_id = products.id 
          WHERE cart.user_id = ?`, [req.session.userId], (err, items) => {
    if (err) return res.status(500).json({ error: 'Failed to checkout' });

    const insertOrder = db.prepare(`INSERT INTO orders (user_id, product_name, status, created_at) VALUES (?, ?, 'current', ?)`);
    items.forEach(item => {
      insertOrder.run(req.session.userId, item.name, timestamp);
    });

    insertOrder.finalize(() => {
      db.run(`DELETE FROM cart WHERE user_id = ?`, [req.session.userId], function (err2) {
        if (err2) return res.status(500).json({ error: 'Failed to clear cart' });
        res.json({ success: true });
      });
    });
  });
});

app.get('/api/orders/:type', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });

  db.all('SELECT * FROM orders WHERE status = ? AND user_id = ?', [req.params.type, req.session.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to load orders' });
    res.json(rows);
  });
});

app.post('/api/orders/complete/:id', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });

  db.run('UPDATE orders SET status = "past" WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to complete order' });
    res.json({ success: true });
  });
});

app.post('/api/admin/orders/complete/:id', (req, res) => {
  if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Access Denied' });

  db.run('UPDATE orders SET status = "past" WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to complete order' });
    res.json({ success: true });
  });
});

app.get('/api/admin/orders', (req, res) => {
  if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Access Denied' });

  db.all('SELECT orders.*, users.username FROM orders JOIN users ON orders.user_id = users.id', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to load all orders' });
    res.json(rows);
  });
});

app.post('/api/service/request', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });

  const { name } = req.body;
  db.run(`INSERT INTO service_requests (user_id, name) VALUES (?, ?)`, [req.session.userId, name], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to request service' });
    res.json({ success: true });
  });
});

app.get('/api/admin/service-requests', (req, res) => {
  if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Access Denied' });

  db.all(`SELECT service_requests.*, users.username FROM service_requests JOIN users ON service_requests.user_id = users.id`, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to load requests' });
    res.json(rows);
  });
});

app.post('/api/admin/service-requests/:id/accept', (req, res) => {
  db.run(`UPDATE service_requests SET status = 'accepted' WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to update status' });
    res.json({ success: true });
  });
});

app.post('/api/admin/service-requests/:id/reject', (req, res) => {
  db.run(`UPDATE service_requests SET status = 'rejected' WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to update status' });
    res.json({ success: true });
  });
});

app.get('/api/session', (req, res) => {
  if (!req.session.userId) return res.json({ username: null });

  db.get('SELECT username, role FROM users WHERE id = ?', [req.session.userId], (err, user) => {
    if (err || !user) return res.json({ username: null });

    db.all('SELECT status FROM orders WHERE user_id = ?', [req.session.userId], (err2, orders) => {
      const totalOrders = orders.length;
      const completedOrders = orders.filter(o => o.status === 'past').length;
      const currentOrders = orders.filter(o => o.status === 'current').length;

      res.json({
        username: user.username,
        role: user.role,
        totalOrders,
        completedOrders,
        currentOrders
      });
    });
  });
});

app.post('/api/profile/username', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });

  const { newUsername } = req.body;
  db.run(`UPDATE users SET username = ? WHERE id = ?`, [newUsername, req.session.userId], function (err) {
    if (err) return res.status(400).json({ error: 'Username may already exist' });

    req.session.destroy(() => {
      res.json({ success: true });
    });
  });
});

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hash], function (err) {
    if (err) return res.status(400).json({ error: 'Username already exists' });
    res.json({ success: true, userId: this.lastID });
  });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'Invalid username' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });

    req.session.userId = user.id;
    req.session.role = user.role;
    res.json({ success: true, userId: user.id });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/devices', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });

  db.all('SELECT id, name FROM devices WHERE user_id = ?', [req.session.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to load devices' });
    res.json(rows);
  });
});

app.post('/api/devices', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });

  const { name } = req.body;
  db.run(`INSERT INTO devices (name, user_id) VALUES (?, ?)`, [name, req.session.userId], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to add device' });
    res.json({ success: true, id: this.lastID });
  });
});

app.delete('/api/devices/:id', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });

  db.run(`DELETE FROM devices WHERE id = ? AND user_id = ?`, [req.params.id, req.session.userId], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to delete device' });
    res.json({ success: true });
  });
});

app.get('/api/admin/stats', (req, res) => {
  if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Access Denied' });

  const stats = {};
  db.get('SELECT COUNT(*) AS count FROM users', (err, row) => {
    stats.users = row.count;
    db.get('SELECT COUNT(*) AS count FROM products', (err2, row2) => {
      stats.products = row2.count;
      db.get('SELECT COUNT(*) AS count FROM orders', (err3, row3) => {
        stats.orders = row3.count;
        res.json(stats);
      });
    });
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
