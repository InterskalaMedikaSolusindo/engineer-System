import Database from 'better-sqlite3';

const db = new Database('inventory.db');

db.prepare(`
  INSERT INTO jadwal_pm (hospital_name, tanggal_pm, status, keterangan, created_by, updated_by)
  VALUES ('Test Hospital', '2023-10-10', 'Upcoming', 'Test', 1, 1)
`).run();

console.log('Inserted data');
