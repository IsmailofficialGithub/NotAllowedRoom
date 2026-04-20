import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/postgress_db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, 'migration');

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('🚀 Starting database migrations...');

        // 1. Create migrations table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS _migrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Get already executed migrations
        const { rows } = await client.query('SELECT name FROM _migrations');
        const executedMigrations = new Set(rows.map(r => r.name));

        // 3. Read migration files
        const files = fs.readdirSync(MIGRATIONS_DIR)
            .filter(f => f.endsWith('.sql'))
            .sort(); // Ensure order by filename

        for (const file of files) {
            if (executedMigrations.has(file)) {
                console.log(`⏩ Skipping ${file} (already executed)`);
                continue;
            }

            console.log(`📑 Executing ${file}...`);
            const filePath = path.join(MIGRATIONS_DIR, file);
            const sql = fs.readFileSync(filePath, 'utf8');

            await client.query('BEGIN');
            try {
                // Execute migration
                await client.query(sql);
                // Record migration
                await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
                await client.query('COMMIT');
                console.log(`✅ Successfully executed ${file}`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`❌ Error executing ${file}:`, err.message);
                process.exit(1);
            }
        }

        console.log('✨ All migrations completed successfully.');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
