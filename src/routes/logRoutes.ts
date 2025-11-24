import express from 'express';
import { getAllLogs } from '../controllers/logController.js';

const router = express.Router();

router.get('/', getAllLogs);

export default router;

