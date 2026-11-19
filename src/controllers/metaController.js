'use strict';
const { asyncHandler } = require('../utils/errors');
const referenceService = require('../services/referenceService');

const meta = (req, res) => res.json(referenceService.meta());
const reference = asyncHandler(async (req, res) => res.json(await referenceService.reference()));

module.exports = { meta, reference };
