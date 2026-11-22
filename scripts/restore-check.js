require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createReadStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const { MEDIA_ROOT } = require('../src/services/imageStorage');
const databasePassword = require('../src/config/databasePassword');

function required(name) {
  if (!process.env[name]) {
    throw new Error(`A variável ${name} é obrigatória para validar a restauração.`);
  }
  return process.env[name];
}

function runMysql(args, inputPath) {
  const child = spawn('mysql', args, {
    env: { ...process.env, MYSQL_PWD: databasePassword() },
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });

  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`mysql terminou com código ${code}.`));
      }
    });
  });
  const input = inputPath
    ? pipeline(createReadStream(inputPath), child.stdin)
    : Promise.resolve(child.stdin.end());

  return Promise.all([input, completed])
    .then(([, result]) => result)
    .catch((error) => {
      child.kill();
      throw error;
    });
}

async function restoreCheck() {
  const backupArgument = process.argv[2];
  if (!backupArgument) {
    throw new Error('Informe a pasta do backup a validar.');
  }
  const backupDirectory = path.resolve(backupArgument);
  const dumpPath = path.join(backupDirectory, 'database.sql');
  const restoreDatabase = required('RESTORE_DB_NAME');
  const configuredDatabase = required('DB_NAME');
  if (!/^[A-Za-z0-9_]{1,64}$/.test(restoreDatabase)) {
    throw new Error('RESTORE_DB_NAME deve conter apenas letras, números e sublinhados.');
  }
  if (restoreDatabase.toLowerCase() === configuredDatabase.toLowerCase()) {
    throw new Error('A restauração de verificação exige RESTORE_DB_NAME diferente de DB_NAME.');
  }
  await fs.access(dumpPath);

  const host = process.env.DB_HOST || '127.0.0.1';
  const port = process.env.DB_PORT || '3306';
  const username = required('DB_USER');
  const mysqlArgs = [
    '--host', host,
    '--port', port,
    '--user', username,
    '--database', restoreDatabase,
  ];
  const existingTables = await runMysql([
    ...mysqlArgs,
    '--batch',
    '--skip-column-names',
    '--execute',
    'SHOW TABLES',
  ]);
  if (existingTables.trim()) {
    throw new Error('RESTORE_DB_NAME deve apontar para um banco vazio.');
  }

  await runMysql(mysqlArgs, dumpPath);

  const mediaBackup = path.join(backupDirectory, 'media');
  const restoreMedia = `${MEDIA_ROOT}.restore-check-${Date.now()}`;
  try {
    await fs.access(mediaBackup);
    await fs.cp(mediaBackup, restoreMedia, { recursive: true, errorOnExist: true });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  console.log(`Banco restaurado em ${restoreDatabase}; arquivos copiados para ${restoreMedia}.`);
}

restoreCheck().catch((error) => {
  console.error(`Falha na restauração de verificação: ${error.message}`);
  process.exitCode = 1;
});
