const DEFAULT_INTERNAL_MESSAGE = 'Internal server error';

const createError = (status = 500, code = 'INTERNAL_ERROR', message = DEFAULT_INTERNAL_MESSAGE) => {
  const normalizedStatus = Number.isInteger(status) ? status : 500;
  const normalizedMessage = message || DEFAULT_INTERNAL_MESSAGE;
  const normalizedCode = code || 'INTERNAL_ERROR';

  const err = new Error(normalizedMessage);
  err.status = normalizedStatus;
  err.statusCode = normalizedStatus;
  err.code = normalizedCode;

  return err;
};

const normalizeError = (error) => {
  if (!error) {
    return {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: DEFAULT_INTERNAL_MESSAGE,
    };
  }

  if (typeof error === 'string') {
    return {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: error || DEFAULT_INTERNAL_MESSAGE,
    };
  }

  const status = Number.isInteger(error.statusCode || error.status)
    ? error.statusCode || error.status
    : 500;

  const fallbackCode = status >= 400 && status < 500 ? 'BAD_REQUEST' : 'INTERNAL_ERROR';

  return {
    status,
    code: error.code || fallbackCode,
    message: error.message || DEFAULT_INTERNAL_MESSAGE,
  };
};

module.exports = {
  createError,
  normalizeError,
};
