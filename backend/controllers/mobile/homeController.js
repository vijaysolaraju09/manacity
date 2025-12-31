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
    const [
      shops,
      contests,
      events,
      services,
      news,
    ] = await Promise.all([
      safeQuery('shops', `
                SELECT id, name, image_url, category, is_open 
                FROM shops 
                WHERE location_id = $1 
                  AND approval_status = 'APPROVED' 
                  AND is_hidden = false 
                ORDER BY is_open DESC, created_at DESC 
                LIMIT 10
            `, [locationId]),
      safeQuery('contests', `
                SELECT id, title, image_url, starts_at, ends_at 
                FROM contests 
                WHERE location_id = $1 
                  AND is_active = true 
                  AND deleted_at IS NULL 
                  AND starts_at <= NOW() 
                  AND ends_at >= NOW()
                LIMIT 3
            `, [locationId]),
      safeQuery('events', `
                SELECT id, title, image_url, starts_at, location_name 
                FROM events 
                WHERE location_id = $1 
                  AND deleted_at IS NULL 
                  AND starts_at >= NOW()
                ORDER BY starts_at ASC 
                LIMIT 3
            `, [locationId]),
      safeQuery('services', `
                SELECT id, name, icon_url 
                FROM service_categories 
                WHERE location_id = $1 
                  AND is_active = true 
                ORDER BY name ASC
            `, [locationId]),
      safeQuery('news', `
                SELECT id, title, image_url, published_at 
                FROM local_news 
                WHERE location_id = $1 
                  AND is_published = true 
                ORDER BY published_at DESC 
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
