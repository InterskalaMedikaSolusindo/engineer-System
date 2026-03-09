import Database from 'better-sqlite3';

const db = new Database('inventory.db');

try {
  const stats = {
    totalSparepart: db.prepare('SELECT COUNT(*) as count FROM spareparts WHERE deleted_at IS NULL').get(),
    totalTools: db.prepare('SELECT COUNT(*) as count FROM inventaris_tools WHERE deleted_at IS NULL').get(),
    totalConsumable: db.prepare('SELECT COUNT(*) as count FROM consumable_parts WHERE deleted_at IS NULL').get(),
    totalPM: db.prepare('SELECT COUNT(*) as count FROM jadwal_pm WHERE deleted_at IS NULL').get(),
    totalTroubleshooting: db.prepare('SELECT COUNT(*) as count FROM troubleshooting_guides WHERE deleted_at IS NULL').get(),
    totalUsers: db.prepare('SELECT COUNT(*) as count FROM users').get(),
    lowStockSpareparts: db.prepare('SELECT * FROM spareparts WHERE stok_saat_ini <= minimum_stock AND deleted_at IS NULL LIMIT 5').all(),
    upcomingPM: db.prepare('SELECT j.*, e.name as equipment_name FROM jadwal_pm j LEFT JOIN equipment e ON j.equipment_id = e.id WHERE j.status = "Upcoming" AND j.deleted_at IS NULL ORDER BY j.tanggal_pm ASC LIMIT 5').all(),
  };
  console.log('Success:', stats);
} catch (e: any) {
  console.error('Error:', e.message);
}
