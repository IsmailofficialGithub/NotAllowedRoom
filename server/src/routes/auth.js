import express from 'express'
import { Register, login, refreshtoken } from '../controller/authController.js';

const router = express.Router();

router.post("/register", Register)
router.post("/login", login)
router.post("/refreshtoken", refreshtoken)



export default router;
