import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  await client.connect();

  const sqlFile = path.resolve(__dirname, '..', 'supabase', 'migrations', '20260512000005_seed_templates.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');
  console.log('Running seed migration...');
  
  // Split by statements if needed, or just run the whole string
  await client.query(sql);
  
  console.log('Templates seeded successfully!');
  await client.end();
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
