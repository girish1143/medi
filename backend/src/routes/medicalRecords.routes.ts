import { Router } from 'express';
import multer from 'multer';
import * as controller from '../controllers/medicalRecord.controller';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { recordQuerySchema, recordUploadSchema, idParamSchema } from '../validators/clinical.validators';
import { asyncHandler } from '../utils/http';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: recordQuerySchema }), asyncHandler(controller.list));
router.post(
  '/',
  upload.single('file'),
  validate({ body: recordUploadSchema }),
  asyncHandler(controller.upload),
);
router.get('/:id/download', validate({ params: idParamSchema }), asyncHandler(controller.download));
router.delete('/:id', validate({ params: idParamSchema }), asyncHandler(controller.remove));

export default router;
