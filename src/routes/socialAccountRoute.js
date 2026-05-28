// src/routes/socialAccountRoute.js
import { Router } from 'express';
import { verifyJWT } from '../middlewares/authMiddleware.js';
import {
  listAccounts, connectAccount, removeAccount
} from '../controllers/socialAccountController.js';

const router = Router();
router.use(verifyJWT);

router.get('/',    listAccounts);    // returns all 50 grouped by platform
router.post('/',   connectAccount);  // admin adds a new account
router.delete('/:id', removeAccount);

export default router;