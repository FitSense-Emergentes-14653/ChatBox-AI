import { Router } from 'express';
import { getCurrentRoutine } from '../controllers/routine.controller.js';
const r = Router();
r.get('/routine/current', getCurrentRoutine); 
export default r;