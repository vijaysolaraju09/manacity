const { query } = require('../../config/db');
const { createError } = require('../../utils/errors');
const { buildHomeQueries } = require('./mobileQueryBuilder');

const buildLogPayload = ({ requestId, locationId, section, reason, error }) => ({
  level: 'error',
  request_id: requestId,
  location_id: locationId,
  section,
  reason,
  error_message: error && error.message,
});

exports.getHomeData = async (req, res, next) => {
  const requestId = req.request_id || req.get('X-Request-Id');
  const locationId = req.locationId || (req.user && req.user.location_id);

  if (!locationId) {
    return next(createError(400, 'LOCATION_MISSING', 'Location context is required'));
  }

  const safeQuery = async (section, sql, params) => {
    try {
      const result = await query(sql, params);
      if (!result || !Array.isArray(result.rows)) {
        console.error(JSON.stringify(buildLogPayload({
          requestId,
          locationId,
          section,
          reason: 'UNEXPECTED_QUERY_SHAPE',
        })));
        return [];
      }
      return result.rows;
    } catch (error) {
      console.error(JSON.stringify(buildLogPayload({
        requestId,
        locationId,
        section,
        reason: 'HOME_SECTION_QUERY_FAILED',
        error,
      })));
      return [];
    }
  };

  let location = req.location ? { id: req.location.id, name: req.location.name } : null;

  if (!location) {
    try {
      const locationResult = await query('SELECT id, name FROM locations WHERE id = $1', [locationId]);
      if (!locationResult || !Array.isArray(locationResult.rows) || locationResult.rows.length === 0) {
        return next(createError(400, 'LOCATION_NOT_FOUND', 'Location not found'));
      }
      location = locationResult.rows[0];
    } catch (error) {
      console.error(JSON.stringify(buildLogPayload({
        requestId,
        locationId,
        section: 'location',
        reason: 'LOCATION_LOOKUP_FAILED',
        error,
      })));
      return next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
    }
  }

  try {
    // Observability: Capture location context used for shops query
    console.log(JSON.stringify({
      level: 'info',
      event: 'MOBILE_HOME_LOCATION_CONTEXT',
      request_id: requestId,
      user_id: req.user ? req.user.user_id : null,
      jwt_location_id: req.user ? req.user.location_id : null,
      middleware_location_id: req.locationId || null,
      sql_location_param: locationId,
      path: req.originalUrl,
      method: req.method,
    }));

    const {
      shopsQuery,
      contestsQuery,
      eventsQuery,
      servicesQuery,
      newsQuery,
    } = await buildHomeQueries();

    const [
      shops,
      contests,
      events,
      services,
      news,
    ] = await Promise.all([
      safeQuery('shops', shopsQuery, [locationId]),
      safeQuery('contests', contestsQuery, [locationId]),
      safeQuery('events', eventsQuery, [locationId]),
      safeQuery('services', servicesQuery, [locationId]),
      safeQuery('news', newsQuery, [locationId]),
    ]);

    res.json({
      location,
      shops,
      contests,
      events,
      services,
      news,
    });
  } catch (error) {
    console.error(JSON.stringify(buildLogPayload({
      requestId,
      locationId,
      section: 'home',
      reason: 'HOME_RESPONSE_FAILURE',
      error,
    })));
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};
