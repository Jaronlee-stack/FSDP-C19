'use strict';
/* validate({ body, query, params }) parses with zod schemas and stores the parsed values in req.valid.
   Use strict objects in the schemas so unknown fields are rejected (whitelist). */
const { AppError } = require('../utils/errors');

module.exports = function validate(schemas) {
  return (req, res, next) => {
    const valid = {};
    const problems = [];
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const r = schemas[part].safeParse(req[part] === undefined ? {} : req[part]);
      if (r.success) valid[part] = r.data;
      else for (const i of r.error.issues) problems.push({ in: part, path: i.path.join('.'), message: i.message });
    }
    if (problems.length) return next(new AppError(400, 'VALIDATION_ERROR', problems[0].path ? `${problems[0].path}: ${problems[0].message}` : problems[0].message, problems));
    req.valid = valid;
    next();
  };
};
