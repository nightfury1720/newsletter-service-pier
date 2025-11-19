import express from 'express';
import subscriberRoutes from './subscriberRoutes.js';
import topicRoutes from './topicRoutes.js';
import contentRoutes from './contentRoutes.js';
import emailLogRoutes from './emailLogRoutes.js';
import { getHealth } from '../controllers/healthController.js';

const router = express.Router();

router.get('/health', getHealth);

router.use('/subscribers', subscriberRoutes);
router.use('/topics', topicRoutes);
router.use('/content', contentRoutes);
router.use('/email-logs', emailLogRoutes);

export default router;

