export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const fields = {};
    result.error.issues.forEach(issue => {
      const path = issue.path.join('.');
      fields[path] = issue.message;
    });
    return res.status(422).json({
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      fields,
      statusCode: 422,
    });
  }
  req.body = result.data;
  next();
};
