'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/metaController');

router.get('/meta', ctrl.meta);
router.get('/reference', ctrl.reference);

module.exports = router;
