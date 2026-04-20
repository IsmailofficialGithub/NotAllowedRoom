import express from 'express'
import { Register, login, refreshtoken, logout, verify_email } from '../controller/authController.js';

const router = express.Router();

router.post("/register", Register)
router.post("/login", login)
router.post("/logout", logout)
router.post("/refreshtoken", refreshtoken)
router.post('/verify_email', verify_email)



export default router;
