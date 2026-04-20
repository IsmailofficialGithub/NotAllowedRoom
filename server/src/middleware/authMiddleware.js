import { pool } from "../config/postgress_db.js";

export const protect = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.startsWith('Bearer') 
            ? req.headers.authorization.split(' ')[1] 
            : req.headers['x-session-token'];

        if (!token) {
            return res.status(401).json({ message: "Not authorized, no token" });
        }

        const sessionResult = await pool.query(
            `SELECT u.id as id, u.email, u.name 
             FROM auth_session s 
             JOIN user_profile u ON s.user_id = u.id 
             WHERE s.session_token = $1 AND s.is_active = true AND u.is_active = true AND u.is_deleted = false`,
            [token]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(401).json({ message: "Not authorized, invalid or expired session" });
        }

        // Attach user to request object
        req.user = sessionResult.rows[0];
        next();
    } catch (error) {
        console.error("Auth Middleware Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
export const optionalProtect = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.startsWith('Bearer') 
            ? req.headers.authorization.split(' ')[1] 
            : req.headers['x-session-token'];

        if (!token) {
            return next();
        }

        const sessionResult = await pool.query(
            `SELECT u.id as id, u.email, u.name 
             FROM auth_session s 
             JOIN user_profile u ON s.user_id = u.id 
             WHERE s.session_token = $1 AND s.is_active = true AND u.is_active = true AND u.is_deleted = false`,
            [token]
        );

        if (sessionResult.rows.length > 0) {
            req.user = sessionResult.rows[0];
        }
        next();
    } catch (error) {
        next(); // Still let them through as guest even if token check fails
    }
};
