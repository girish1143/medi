import { Router } from 'express';
import * as controller from '../controllers/support.controller';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { complaintSchema } from '../validators/clinical.validators';
import { asyncHandler } from '../utils/http';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(controller.listMine));
router.post('/', validate({ body: complaintSchema }), asyncHandler(controller.create));

export default router;
