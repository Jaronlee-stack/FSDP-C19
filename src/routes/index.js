'use strict';
/* everything under /api/v1. Later areas (public, student, instructor, admin) are mounted here. */
const router = require('express').Router();
const requireJson = require('../middleware/requireJson');
const { apiNotFound } = require('../middleware/error');

router.use(require('../middleware/requestContext').requestContext);
router.use(requireJson);
router.use(require('./meta.routes'));
router.use('/auth', require('./auth.routes'));
router.use('/public', require('./public.routes'));
router.use('/student', require('./student.routes'));
router.use('/instructor', require('./instructor.routes'));
router.use('/admin', require('./admin'));

router.use(apiNotFound);

module.exports = router;
