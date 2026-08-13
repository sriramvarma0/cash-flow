const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const prismaDir = path.join(rootDir, 'prisma');
const dbFile = path.join(prismaDir, 'dev.db');
const backupFile = path.join(prismaDir, 'dev.db.bak');

fs.mkdirSync(prismaDir, { recursive: true });

if (!fs.existsSync(dbFile)) {
  console.log(`No SQLite database found at ${dbFile}. Skipping backup.`);
  process.exit(0);
}

fs.copyFileSync(dbFile, backupFile);

console.log(`SQLite backup created at ${backupFile}`);
