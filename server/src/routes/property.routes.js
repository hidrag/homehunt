import express from 'express';
import propertyController from '../controllers/property.controller.js';

const router = express.Router();

router.get('/', propertyController.getProperties);
router.get('/:id', propertyController.getPropertyById);

export default router;
