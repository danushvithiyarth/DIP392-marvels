const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');

db.serialize(() => {
  db.run("DELETE FROM users");
  db.run("DELETE FROM products");
  db.run("DELETE FROM devices");
  db.run("DELETE FROM orders");
  db.run("DELETE FROM cart");
  db.run("DELETE FROM sell_items");
  db.run("DELETE FROM service_requests");

  db.run("INSERT INTO products (name, price) VALUES ('Gaming Laptop', 1500)");
  db.run("INSERT INTO products (name, price) VALUES ('Intel CPU', 300)");

});

console.log("Database seeded");
db.close();
