import { Router } from 'express';
import * as chatController from '../controllers/chat.controller.js';

const r = Router();

r.post('/session/start', chatController.startSession);
r.post('/session/reset', chatController.resetSession);
r.post('/session/end',   chatController.endSession);
r.post('/chat/send',     chatController.sendMessage);

export default r;
