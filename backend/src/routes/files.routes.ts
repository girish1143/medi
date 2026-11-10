import { Router } from 'express';
import * as controller from '../controllers/files.controller';
import { asyncHandler } from '../utils/http';

const router = Router();

// Access is granted by an HMAC-signed, expiring token issued by the API.
router.get('/:bucket/*', asyncHandler(controller.serveLocalFile));

export default router;
