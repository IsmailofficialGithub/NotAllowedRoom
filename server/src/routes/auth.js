import express from 'express'
import { Register, login, refreshtoken, logout } from '../controller/authController.js';

const router = express.Router();

router.post("/register", Register)
router.post("/login", login)
router.post("/logout", logout)
router.post("/refreshtoken", refreshtoken)



export default router;
