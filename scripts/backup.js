require('dotenv').config();

const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { MEDIA_ROOT } = require('../src/services/imageStorage');
const databasePassword = require('../src/config/databasePassword');

function required(name) {
  if (!process.env[name]) {
    throw new Error(`A variável ${name} é obrigatória para gerar o backup.`);
  }
  return process.env[name];
}

async function createBackup() {
  const database = required('DB_NAME');
  const username = required('DB_USER');
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = process.env.DB_PORT || '3306';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDirectory = path.resolve(process.env.BACKUP_DIR || 'backups', timestamp);
  const mediaBackup = path.join(backupDirectory, 'media');
  const dumpPath = path.join(backupDirectory, 'database.sql');

  await fs.mkdir(path.dirname(backupDirectory), { recursive: true });
  await fs.mkdir(backupDirectory, { recursive: false, mode: 0o700 });
  const child = spawn('mysqldump', [
    '--host', host,
    '--port', port,
    '--user', username,
    '--single-transaction',
    '--routines',
    '--triggers',
    '--events',
    '--hex-blob',
    database,
  ], {
    env: { ...process.env, MYSQL_PWD: databasePassword() },
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`mysqldump terminou com código ${code}.`));
      }
    });
  });

  try {
    await Promise.all([
      pipeline(child.stdout, createWriteStream(dumpPath, { flags: 'wx', mode: 0o600 })),
      completed,
    ]);

    try {
      await fs.access(MEDIA_ROOT);
      await fs.cp(MEDIA_ROOT, mediaBackup, { recursive: true, errorOnExist: true });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    console.log(`Backup criado em ${backupDirectory}`);
  } catch (error) {
    child.kill();
    throw error;
  }
}

createBackup().catch((error) => {
  console.error(`Falha ao criar backup: ${error.message}`);
  process.exitCode = 1;
});
