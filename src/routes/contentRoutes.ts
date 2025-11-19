import express from 'express';
import {
  createContent,
  getContent,
  getContentById,
  updateContent,
  deleteContent,
} from '../controllers/contentController.js';

const router = express.Router();

router.post('/', createContent);
router.get('/', getContent);
router.get('/:id', getContentById);
router.patch('/:id', updateContent);
router.delete('/:id', deleteContent);

export default router;

