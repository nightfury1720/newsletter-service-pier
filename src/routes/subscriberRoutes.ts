import express from 'express';
import {
  createSubscriber,
  getSubscribers,
  getSubscriber,
  deleteSubscriber,
  subscribeToTopic,
  unsubscribeFromTopic,
} from '../controllers/subscriberController.js';

const router = express.Router();

router.post('/', createSubscriber);
router.get('/', getSubscribers);
router.get('/:id', getSubscriber);
router.delete('/:id', deleteSubscriber);
router.post('/:id/subscribe', subscribeToTopic);
router.delete('/:id/subscribe/:topicId', unsubscribeFromTopic);

export default router;

