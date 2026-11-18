'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/authController');
const validate = require('../middleware/validate');
const { authenticateAllowingPasswordChange } = require('../middleware/auth');
const { loginLimiter, changePasswordLimiter } = require('../middleware/rateLimit');
const v = require('../validators/auth');

router.post('/login', loginLimiter, validate({ body: v.login }), ctrl.login);
router.post('/logout', ctrl.logout);
/* the two routes a user who must change their password may still call */
router.get('/me', authenticateAllowingPasswordChange, ctrl.me);
router.post('/change-password', authenticateAllowingPasswordChange, changePasswordLimiter, validate({ body: v.changePassword }), ctrl.changePassword);
router.post('/forgot-password', loginLimiter, validate({ body: v.forgotPassword }), ctrl.forgotPassword);

module.exports = router;
