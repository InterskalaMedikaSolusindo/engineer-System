import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-jwt-auth';

// Setup storage for uploads
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

app.use(express.json());
app.use('/uploads', express.static(uploadDir));

// Database Setup
const db = new Database('inventory.db');

// Initialize Database Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Viewer', -- Super Admin, Engineer, Viewer
    status TEXT NOT NULL DEFAULT 'active', -- active, inactive
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS spareparts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama_sparepart TEXT NOT NULL,
    tipe TEXT,
    serial_number TEXT,
    brand TEXT,
    klasifikasi TEXT,
    equipment_id INTEGER,
    stok_saat_ini INTEGER DEFAULT 0,
    minimum_stock INTEGER DEFAULT 0,
    restock_status TEXT DEFAULT 'OK',
    kondisi TEXT,
    gambar TEXT,
    keterangan TEXT,
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (equipment_id) REFERENCES equipment(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (updated_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS inventaris_tools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama_tools TEXT NOT NULL,
    tipe TEXT,
    serial_number TEXT,
    brand TEXT,
    klasifikasi TEXT,
    stok_saat_ini INTEGER DEFAULT 0,
    minimum_stock INTEGER DEFAULT 0,
    kondisi TEXT,
    lokasi TEXT,
    gambar TEXT,
    keterangan TEXT,
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (updated_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS consumable_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama_part TEXT NOT NULL,
    tipe TEXT,
    brand TEXT,
    klasifikasi TEXT,
    stok_saat_ini INTEGER DEFAULT 0,
    minimum_stock INTEGER DEFAULT 0,
    restock_status TEXT DEFAULT 'OK',
    kondisi TEXT,
    gambar TEXT,
    keterangan TEXT,
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (updated_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS jadwal_pm (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hospital_name TEXT NOT NULL,
    tanggal_pm DATE NOT NULL,
    status TEXT DEFAULT 'Upcoming', -- Upcoming, Completed, Overdue
    keterangan TEXT,
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (updated_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS troubleshooting_guides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id INTEGER,
    nama_trouble TEXT NOT NULL,
    isi_troubleshooting TEXT,
    file_path TEXT,
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (equipment_id) REFERENCES equipment(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (updated_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id INTEGER,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Seed initial Super Admin if not exists
try {
  db.exec('ALTER TABLE jadwal_pm ADD COLUMN hospital_name TEXT');
} catch (e) {
  // Column might already exist
}

const adminExists = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@example.com');
if (!adminExists) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)').run(
    'Super Admin',
    'admin@example.com',
    hashedPassword,
    'Super Admin',
    'active'
  );
}

// Middleware for Authentication
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

const requireRole = (roles: string[]) => {
  return (req: any, res: any, next: any) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
};

// Helper for audit logging
const logAudit = (userId: number, action: string, entity: string, entityId: number, details: any) => {
  try {
    db.prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)').run(
      userId, action, entity, entityId, JSON.stringify(details)
    );
  } catch (err) {
    console.error('Failed to log audit:', err);
  }
};

// API Routes

// Auth
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user: any = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: 'Invalid credentials or inactive account' });
  }

  const validPassword = bcrypt.compareSync(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// Users
app.get('/api/users', authenticateToken, requireRole(['Super Admin']), (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, status, created_at FROM users').all();
  res.json(users);
});

app.post('/api/users', authenticateToken, requireRole(['Super Admin']), (req, res) => {
  const { name, email, password, role, status } = req.body;
  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)').run(
      name, email, hashedPassword, role, status || 'active'
    );
    logAudit(req.user.id, 'CREATE', 'User', result.lastInsertRowid as number, { email, role });
    res.json({ id: result.lastInsertRowid });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/users/:id', authenticateToken, requireRole(['Super Admin']), (req, res) => {
  const { name, email, role, status, password } = req.body;
  try {
    if (password) {
      const hashedPassword = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE users SET name = ?, email = ?, password = ?, role = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        name, email, hashedPassword, role, status, req.params.id
      );
    } else {
      db.prepare('UPDATE users SET name = ?, email = ?, role = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        name, email, role, status, req.params.id
      );
    }
    logAudit(req.user.id, 'UPDATE', 'User', parseInt(req.params.id), { email, role, status });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/users/:id', authenticateToken, requireRole(['Super Admin']), (req, res) => {
  try {
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    logAudit(req.user.id, 'DELETE', 'User', parseInt(req.params.id), {});
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Dashboard Stats
app.get('/api/dashboard', authenticateToken, (req, res) => {
  try {
    const stats = {
      totalSparepart: db.prepare('SELECT COUNT(*) as count FROM spareparts').get() as {count: number},
      totalTools: db.prepare('SELECT COUNT(*) as count FROM inventaris_tools').get() as {count: number},
      totalConsumable: db.prepare('SELECT COUNT(*) as count FROM consumable_parts').get() as {count: number},
      totalPM: db.prepare('SELECT COUNT(*) as count FROM jadwal_pm').get() as {count: number},
      totalTroubleshooting: db.prepare('SELECT COUNT(*) as count FROM troubleshooting_guides').get() as {count: number},
      totalUsers: db.prepare('SELECT COUNT(*) as count FROM users').get() as {count: number},
      lowStockSpareparts: db.prepare(`
        SELECT * FROM (
          SELECT id, nama_sparepart as name, tipe, stok_saat_ini, minimum_stock, 'Sparepart' as category FROM spareparts WHERE stok_saat_ini <= minimum_stock
          UNION ALL
          SELECT id, nama_tools as name, tipe, stok_saat_ini, minimum_stock, 'Tool' as category FROM inventaris_tools WHERE stok_saat_ini <= minimum_stock
          UNION ALL
          SELECT id, nama_part as name, tipe, stok_saat_ini, minimum_stock, 'Consumable' as category FROM consumable_parts WHERE stok_saat_ini <= minimum_stock
        ) ORDER BY (stok_saat_ini - minimum_stock) ASC LIMIT 10
      `).all(),
      upcomingPM: db.prepare('SELECT * FROM jadwal_pm WHERE status = \'Upcoming\' ORDER BY tanggal_pm ASC LIMIT 5').all(),
      recentActivities: db.prepare('SELECT a.*, u.name as user_name FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT 5').all(),
      stockOverview: db.prepare(`
        SELECT nama_sparepart as name, stok_saat_ini as current, minimum_stock as minimum, 'Sparepart' as category FROM spareparts
        UNION ALL
        SELECT nama_tools as name, stok_saat_ini as current, minimum_stock as minimum, 'Tool' as category FROM inventaris_tools
        UNION ALL
        SELECT nama_part as name, stok_saat_ini as current, minimum_stock as minimum, 'Consumable' as category FROM consumable_parts
      `).all().sort((a: any, b: any) => (a.current - a.minimum) - (b.current - b.minimum)).slice(0, 15),
      recentTroubleshooting: db.prepare('SELECT t.*, e.name as equipment_name FROM troubleshooting_guides t LEFT JOIN equipment e ON t.equipment_id = e.id ORDER BY t.created_at DESC LIMIT 5').all(),
    };
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Equipment (Master)
app.get('/api/equipment', authenticateToken, (req, res) => {
  const equipment = db.prepare('SELECT * FROM equipment').all();
  res.json(equipment);
});

app.post('/api/equipment', authenticateToken, requireRole(['Super Admin', 'Engineer']), (req, res) => {
  const { name, description } = req.body;
  const result = db.prepare('INSERT INTO equipment (name, description) VALUES (?, ?)').run(name, description);
  logAudit(req.user.id, 'CREATE', 'Equipment', result.lastInsertRowid as number, { name });
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/equipment/:id', authenticateToken, requireRole(['Super Admin', 'Engineer']), (req, res) => {
  const { name, description } = req.body;
  db.prepare('UPDATE equipment SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, description, req.params.id);
  logAudit(req.user.id, 'UPDATE', 'Equipment', parseInt(req.params.id), { name });
  res.json({ success: true });
});

app.delete('/api/equipment/:id', authenticateToken, requireRole(['Super Admin', 'Engineer']), (req, res) => {
  db.prepare('DELETE FROM equipment WHERE id = ?').run(req.params.id);
  logAudit(req.user.id, 'DELETE', 'Equipment', parseInt(req.params.id), {});
  res.json({ success: true });
});

// Spareparts
app.get('/api/spareparts', authenticateToken, (req, res) => {
  const parts = db.prepare('SELECT s.*, e.name as equipment_name FROM spareparts s LEFT JOIN equipment e ON s.equipment_id = e.id').all();
  res.json(parts);
});

app.post('/api/spareparts', authenticateToken, requireRole(['Super Admin', 'Engineer']), upload.single('gambar'), (req, res) => {
  const { nama_sparepart, tipe, serial_number, brand, klasifikasi, equipment_id, stok_saat_ini, minimum_stock, kondisi, keterangan } = req.body;
  const gambar = req.file ? `/uploads/${req.file.filename}` : null;
  const restock_status = parseInt(stok_saat_ini) <= parseInt(minimum_stock) ? 'Need Restock' : 'OK';

  const eqId = (equipment_id && equipment_id !== 'null') ? parseInt(equipment_id) : null;

  const result = db.prepare(`
    INSERT INTO spareparts (nama_sparepart, tipe, serial_number, brand, klasifikasi, equipment_id, stok_saat_ini, minimum_stock, restock_status, kondisi, gambar, keterangan, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(nama_sparepart, tipe, serial_number, brand, klasifikasi, eqId, stok_saat_ini, minimum_stock, restock_status, kondisi, gambar, keterangan, req.user.id, req.user.id);
  
  logAudit(req.user.id, 'CREATE', 'Sparepart', result.lastInsertRowid as number, { nama_sparepart });
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/spareparts/:id', authenticateToken, requireRole(['Super Admin', 'Engineer']), upload.single('gambar'), (req, res) => {
  const { nama_sparepart, tipe, serial_number, brand, klasifikasi, equipment_id, stok_saat_ini, minimum_stock, kondisi, keterangan } = req.body;
  const restock_status = parseInt(stok_saat_ini) <= parseInt(minimum_stock) ? 'Need Restock' : 'OK';
  
  const eqId = (equipment_id && equipment_id !== 'null') ? parseInt(equipment_id) : null;
  
  let query = `UPDATE spareparts SET nama_sparepart = ?, tipe = ?, serial_number = ?, brand = ?, klasifikasi = ?, equipment_id = ?, stok_saat_ini = ?, minimum_stock = ?, restock_status = ?, kondisi = ?, keterangan = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP`;
  const params = [nama_sparepart, tipe, serial_number, brand, klasifikasi, eqId, stok_saat_ini, minimum_stock, restock_status, kondisi, keterangan, req.user.id];

  if (req.file) {
    query += `, gambar = ?`;
    params.push(`/uploads/${req.file.filename}`);
  }
  query += ` WHERE id = ?`;
  params.push(req.params.id);

  db.prepare(query).run(...params);
  logAudit(req.user.id, 'UPDATE', 'Sparepart', parseInt(req.params.id), { nama_sparepart });
  res.json({ success: true });
});

app.delete('/api/spareparts/:id', authenticateToken, requireRole(['Super Admin', 'Engineer']), (req, res) => {
  db.prepare('DELETE FROM spareparts WHERE id = ?').run(req.params.id);
  logAudit(req.user.id, 'DELETE', 'Sparepart', parseInt(req.params.id), {});
  res.json({ success: true });
});

// Inventaris Tools
app.get('/api/tools', authenticateToken, (req, res) => {
  const tools = db.prepare('SELECT * FROM inventaris_tools').all();
  res.json(tools);
});

app.post('/api/tools', authenticateToken, requireRole(['Super Admin', 'Engineer']), upload.single('gambar'), (req, res) => {
  const { nama_tools, tipe, serial_number, brand, klasifikasi, stok_saat_ini, minimum_stock, kondisi, lokasi, keterangan } = req.body;
  const gambar = req.file ? `/uploads/${req.file.filename}` : null;

  const result = db.prepare(`
    INSERT INTO inventaris_tools (nama_tools, tipe, serial_number, brand, klasifikasi, stok_saat_ini, minimum_stock, kondisi, lokasi, gambar, keterangan, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(nama_tools, tipe, serial_number, brand, klasifikasi, stok_saat_ini, minimum_stock, kondisi, lokasi, gambar, keterangan, req.user.id, req.user.id);
  
  logAudit(req.user.id, 'CREATE', 'Tool', result.lastInsertRowid as number, { nama_tools });
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/tools/:id', authenticateToken, requireRole(['Super Admin', 'Engineer']), upload.single('gambar'), (req, res) => {
  const { nama_tools, tipe, serial_number, brand, klasifikasi, stok_saat_ini, minimum_stock, kondisi, lokasi, keterangan } = req.body;
  
  let query = `UPDATE inventaris_tools SET nama_tools = ?, tipe = ?, serial_number = ?, brand = ?, klasifikasi = ?, stok_saat_ini = ?, minimum_stock = ?, kondisi = ?, lokasi = ?, keterangan = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP`;
  const params = [nama_tools, tipe, serial_number, brand, klasifikasi, stok_saat_ini, minimum_stock, kondisi, lokasi, keterangan, req.user.id];

  if (req.file) {
    query += `, gambar = ?`;
    params.push(`/uploads/${req.file.filename}`);
  }
  query += ` WHERE id = ?`;
  params.push(req.params.id);

  db.prepare(query).run(...params);
  logAudit(req.user.id, 'UPDATE', 'Tool', parseInt(req.params.id), { nama_tools });
  res.json({ success: true });
});

app.delete('/api/tools/:id', authenticateToken, requireRole(['Super Admin', 'Engineer']), (req, res) => {
  db.prepare('DELETE FROM inventaris_tools WHERE id = ?').run(req.params.id);
  logAudit(req.user.id, 'DELETE', 'Tool', parseInt(req.params.id), {});
  res.json({ success: true });
});

// Consumable Parts
app.get('/api/consumables', authenticateToken, (req, res) => {
  const parts = db.prepare('SELECT * FROM consumable_parts').all();
  res.json(parts);
});

app.post('/api/consumables', authenticateToken, requireRole(['Super Admin', 'Engineer']), upload.single('gambar'), (req, res) => {
  const { nama_part, tipe, brand, klasifikasi, stok_saat_ini, minimum_stock, kondisi, keterangan } = req.body;
  const gambar = req.file ? `/uploads/${req.file.filename}` : null;
  const restock_status = parseInt(stok_saat_ini) <= parseInt(minimum_stock) ? 'Need Restock' : 'OK';

  const result = db.prepare(`
    INSERT INTO consumable_parts (nama_part, tipe, brand, klasifikasi, stok_saat_ini, minimum_stock, restock_status, kondisi, gambar, keterangan, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(nama_part, tipe, brand, klasifikasi, stok_saat_ini, minimum_stock, restock_status, kondisi, gambar, keterangan, req.user.id, req.user.id);
  
  logAudit(req.user.id, 'CREATE', 'Consumable', result.lastInsertRowid as number, { nama_part });
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/consumables/:id', authenticateToken, requireRole(['Super Admin', 'Engineer']), upload.single('gambar'), (req, res) => {
  const { nama_part, tipe, brand, klasifikasi, stok_saat_ini, minimum_stock, kondisi, keterangan } = req.body;
  const restock_status = parseInt(stok_saat_ini) <= parseInt(minimum_stock) ? 'Need Restock' : 'OK';
  
  let query = `UPDATE consumable_parts SET nama_part = ?, tipe = ?, brand = ?, klasifikasi = ?, stok_saat_ini = ?, minimum_stock = ?, restock_status = ?, kondisi = ?, keterangan = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP`;
  const params = [nama_part, tipe, brand, klasifikasi, stok_saat_ini, minimum_stock, restock_status, kondisi, keterangan, req.user.id];

  if (req.file) {
    query += `, gambar = ?`;
    params.push(`/uploads/${req.file.filename}`);
  }
  query += ` WHERE id = ?`;
  params.push(req.params.id);

  db.prepare(query).run(...params);
  logAudit(req.user.id, 'UPDATE', 'Consumable', parseInt(req.params.id), { nama_part });
  res.json({ success: true });
});

app.delete('/api/consumables/:id', authenticateToken, requireRole(['Super Admin', 'Engineer']), (req, res) => {
  db.prepare('DELETE FROM consumable_parts WHERE id = ?').run(req.params.id);
  logAudit(req.user.id, 'DELETE', 'Consumable', parseInt(req.params.id), {});
  res.json({ success: true });
});

// Jadwal PM
app.get('/api/pm', authenticateToken, (req, res) => {
  const pm = db.prepare('SELECT * FROM jadwal_pm').all();
  res.json(pm);
});

app.post('/api/pm', authenticateToken, requireRole(['Super Admin', 'Engineer']), (req, res) => {
  const { hospital_name, tanggal_pm, status, keterangan } = req.body;
  const result = db.prepare(`
    INSERT INTO jadwal_pm (hospital_name, tanggal_pm, status, keterangan, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(hospital_name, tanggal_pm, status || 'Upcoming', keterangan, req.user.id, req.user.id);
  
  logAudit(req.user.id, 'CREATE', 'PM', result.lastInsertRowid as number, { hospital_name, tanggal_pm });
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/pm/:id', authenticateToken, requireRole(['Super Admin', 'Engineer']), (req, res) => {
  const { hospital_name, tanggal_pm, status, keterangan } = req.body;
  db.prepare(`
    UPDATE jadwal_pm SET hospital_name = ?, tanggal_pm = ?, status = ?, keterangan = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(hospital_name, tanggal_pm, status, keterangan, req.user.id, req.params.id);
  
  logAudit(req.user.id, 'UPDATE', 'PM', parseInt(req.params.id), { hospital_name, status });
  res.json({ success: true });
});

app.delete('/api/pm/:id', authenticateToken, requireRole(['Super Admin', 'Engineer']), (req, res) => {
  db.prepare('DELETE FROM jadwal_pm WHERE id = ?').run(req.params.id);
  logAudit(req.user.id, 'DELETE', 'PM', parseInt(req.params.id), {});
  res.json({ success: true });
});

// Troubleshooting Guides
app.get('/api/troubleshooting', authenticateToken, (req, res) => {
  const guides = db.prepare('SELECT t.*, e.name as equipment_name FROM troubleshooting_guides t LEFT JOIN equipment e ON t.equipment_id = e.id').all();
  res.json(guides);
});

app.post('/api/troubleshooting', authenticateToken, requireRole(['Super Admin', 'Engineer']), upload.single('file'), (req, res) => {
  const { equipment_id, nama_trouble, isi_troubleshooting } = req.body;
  const file_path = req.file ? `/uploads/${req.file.filename}` : null;

  const eqId = (equipment_id && equipment_id !== 'null') ? parseInt(equipment_id) : null;
  const result = db.prepare(`
    INSERT INTO troubleshooting_guides (equipment_id, nama_trouble, isi_troubleshooting, file_path, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(eqId, nama_trouble, isi_troubleshooting, file_path, req.user.id, req.user.id);
  
  logAudit(req.user.id, 'CREATE', 'Troubleshooting', result.lastInsertRowid as number, { nama_trouble });
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/troubleshooting/:id', authenticateToken, requireRole(['Super Admin', 'Engineer']), upload.single('file'), (req, res) => {
  const { equipment_id, nama_trouble, isi_troubleshooting } = req.body;
  
  const eqId = (equipment_id && equipment_id !== 'null') ? parseInt(equipment_id) : null;
  let query = `UPDATE troubleshooting_guides SET equipment_id = ?, nama_trouble = ?, isi_troubleshooting = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP`;
  const params = [eqId, nama_trouble, isi_troubleshooting, req.user.id];

  if (req.file) {
    query += `, file_path = ?`;
    params.push(`/uploads/${req.file.filename}`);
  }
  query += ` WHERE id = ?`;
  params.push(req.params.id);

  db.prepare(query).run(...params);
  logAudit(req.user.id, 'UPDATE', 'Troubleshooting', parseInt(req.params.id), { nama_trouble });
  res.json({ success: true });
});

app.delete('/api/troubleshooting/:id', authenticateToken, requireRole(['Super Admin', 'Engineer']), (req, res) => {
  db.prepare('DELETE FROM troubleshooting_guides WHERE id = ?').run(req.params.id);
  logAudit(req.user.id, 'DELETE', 'Troubleshooting', parseInt(req.params.id), {});
  res.json({ success: true });
});

// Audit Logs
app.get('/api/audit-logs', authenticateToken, requireRole(['Super Admin']), (req, res) => {
  const logs = db.prepare('SELECT a.*, u.name as user_name FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT 100').all();
  res.json(logs);
});

// Global error handler for API routes
app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('API Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
