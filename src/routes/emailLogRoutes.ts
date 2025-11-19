import express from 'express';
import {
  getEmailLogs,
  getEmailStats,
} from '../controllers/emailLogController.js';

const router = express.Router();

router.get('/', getEmailLogs);
router.get('/stats/:contentId', getEmailStats);

export default router;

