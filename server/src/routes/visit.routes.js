import express from 'express';
import {requireAuth,requireRole} from '../middlewares/auth.middleware.js';
import * as c from '../controllers/visit.controller.js';
const r=express.Router(); r.use(requireAuth); r.post('/',requireRole('buyer'),c.create); r.get('/',requireRole('buyer'),c.mine); r.get('/agent',requireRole('agent'),c.agent); r.patch('/:id/status',requireRole('buyer','agent'),c.status); export default r;
