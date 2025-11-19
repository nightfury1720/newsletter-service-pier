import express from 'express';
import {
  createTopic,
  getTopics,
  getTopic,
  deleteTopic,
} from '../controllers/topicController.js';

const router = express.Router();

router.post('/', createTopic);
router.get('/', getTopics);
router.get('/:id', getTopic);
router.delete('/:id', deleteTopic);

export default router;

