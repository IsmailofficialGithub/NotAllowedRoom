import { hashPassword, comparePassword } from "../lib/hased.js";
import { pool } from "../config/postgress_db.js";
import { v4 as uuidv4 } from 'uuid';

export const Register = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const hashedPassword = await hashPassword(password);
        const user = {
            name,
            email,
            hashedPassword,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isActive: true,
            isDeleted: false
        }

        const result = await pool.query(
            "INSERT INTO user_profile (name, email, hashed_password, created_at, updated_at, is_active, is_deleted) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
            [user.name, user.email, user.hashedPassword, user.createdAt, user.updatedAt, user.isActive, user.isDeleted]
        );

        console.log('User registered successfully');

        res.status(201).json({
            success: true,
            message: "User has been registered",
            userId: result.rows[0].id,
            email: user.email,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            isActive: user.isActive,
        });
    } catch (error) {
        console.log(error);
        if (error.code === '23505') {
            return res.status(409).json({ message: "Email already exists" });
        }
        res.status(500).json({ message: "Internal server error" });
    }
}

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const user = await pool.query("SELECT * FROM user_profile WHERE email = $1", [email]);
        if (user.rows.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        const validPassword = await comparePassword(password, user.rows[0].hashed_password);
        if (!validPassword) {
            return res.status(401).json({ message: "Invalid password" });
        }

        const sessionToken = uuidv4();
        const session = {
            user_id: user.rows[0].id,
            session_token: sessionToken,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_active: true,
            is_deleted: false
        }

        await pool.query(
            "INSERT INTO auth_session (user_id, session_token, created_at, updated_at, is_active, is_deleted) VALUES ($1, $2, $3, $4, $5, $6)",
            [session.user_id, session.session_token, session.created_at, session.updated_at, session.is_active, session.is_deleted]
        );

        console.log('User logged in successfully');

        res.status(200).json({
            success: true,
            message: "User logged in successfully",
            userId: user.rows[0].id,
            email: user.rows[0].email,
            createdAt: user.rows[0].created_at,
            updatedAt: user.rows[0].updated_at,
            isActive: user.rows[0].is_active,
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Internal server error" });
    }
}

export const refreshtoken = async (req, res) => {
    try {
        const { session_token } = req.body;
        if (!session_token) {
            return res.status(400).json({ message: "Session token is required" });
        }

        const session = await pool.query("SELECT * FROM auth_session WHERE session_token = $1", [session_token]);
        if (session.rows.length === 0) {
            return res.status(404).json({ message: "Session not found" });
        }

        const sessionToken = uuidv4();
        const session_data = {
            user_id: session.rows[0].user_id,
            session_token: sessionToken,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_active: true,
            is_deleted: false
        }

        await pool.query(
            "INSERT INTO auth_session (user_id, session_token, created_at, updated_at, is_active, is_deleted) VALUES ($1, $2, $3, $4, $5, $6)",
            [session_data.user_id, session_data.session_token, session_data.created_at, session_data.updated_at, session_data.is_active, session_data.is_deleted]
        );

        console.log('Token refreshed successfully');

        res.status(200).json({
            success: true,
            message: "Token refreshed successfully",
            userId: session.rows[0].user_id,
            sessionToken: sessionToken
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Internal server error" });
    }
}