import { Router } from 'express';
import * as controller from '../controllers/notification.controller';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { notificationQuerySchema } from '../validators/admin.validators';
import { idParamSchema } from '../validators/clinical.validators';
import { asyncHandler } from '../utils/http';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: notificationQuerySchema }), asyncHandler(controller.list));
router.patch('/:id/read', validate({ params: idParamSchema }), asyncHandler(controller.markRead));
router.post('/read-all', asyncHandler(controller.markAllRead));

export default router;
