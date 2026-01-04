const { query } = require('../../config/db');
const { createError } = require('../../utils/errors');

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

    const [
      shops,
      contests,
      events,
      services,
      news,
    ] = await Promise.all([
      safeQuery('shops', `
                SELECT id, name, description, is_open, created_at, NULL::text AS category 
                FROM shops 
                WHERE location_id = $1 
                  AND approval_status = 'APPROVED' 
                  AND is_hidden = false 
                ORDER BY is_open DESC, created_at DESC 
                LIMIT 10
            `, [locationId]),
      safeQuery('contests', `
                SELECT id, title, starts_at, ends_at 
                FROM contests 
                WHERE location_id = $1 
                  AND is_active = true 
                  AND deleted_at IS NULL 
                  AND starts_at <= NOW() 
                  AND ends_at >= NOW()
                LIMIT 3
            `, [locationId]),
      safeQuery('events', `
                SELECT id, title, event_date AS starts_at, venue AS location_name 
                FROM events 
                WHERE location_id = $1 
                  AND deleted_at IS NULL 
                  AND event_date >= NOW()
                ORDER BY event_date ASC 
                LIMIT 3
            `, [locationId]),
      safeQuery('services', `
                SELECT id, name, description, is_active, created_at 
                FROM service_categories 
                WHERE location_id = $1 
                  AND is_active = true 
                ORDER BY name ASC
            `, [locationId]),
      safeQuery('news', `
                SELECT id, title, body, created_at AS published_at 
                FROM local_news 
                WHERE location_id = $1 
                  AND deleted_at IS NULL 
                ORDER BY created_at DESC 
                LIMIT 5
            `, [locationId]),
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
