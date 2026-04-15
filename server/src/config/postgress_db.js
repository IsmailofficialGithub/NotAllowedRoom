import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Ensure .env is loaded from the root of the server directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../../.env") });

const {
    DATABASE_URL,
    DB_USER: USER,
    DB_PASSWORD: PASSWORD,
    DB_HOST: HOST,
    DB_PORT: PORT
} = process.env;

// Check if critical variables are loaded
if (!USER || !PASSWORD) {
    console.error("❌ Database credentials missing in .env file!");
}

export const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    user: USER,
    password: String(PASSWORD || ""), // Ensure it's a string to avoid SASL error
    host: HOST,
    port: PORT,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

const connectDB = async () => {
    try {
        const client = await pool.connect();
        console.log('✅ Database connected successfully');
        client.release();
    } catch (err) {
        console.error('❌ Database connection error:', err.message);
        if (err.code === '28P01') {
            console.error('👉 Tip: The password in your .env file does not match your local PostgreSQL password.');
        }
    }
};

export default connectDB;