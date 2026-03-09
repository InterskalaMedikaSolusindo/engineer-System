import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const db = new Database('inventory.db');
const user = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@example.com') as any;

const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, 'super-secret-key-for-jwt-auth', { expiresIn: '24h' });

fetch('http://localhost:3000/api/dashboard', {
  headers: { Authorization: `Bearer ${token}` }
}).then(async r => {
  console.log(r.status, r.statusText);
  console.log(await r.text());
});
