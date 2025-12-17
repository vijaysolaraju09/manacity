const { query } = require('../../config/db');

exports.getHomeData = async (req, res) => {
    try {
        const locationId = req.locationId;

        // Execute all queries in parallel for performance
        const [
            locationRes,
            shopsRes,
            contestsRes,
            eventsRes,
            servicesRes,
            newsRes
        ] = await Promise.all([
            // 1. Location Details
            query('SELECT id, name FROM locations WHERE id = $1', [locationId]),

            // 2. Featured Shops (Approved, Not Hidden, Open first)
            query(`
                SELECT id, name, image_url, category, is_open 
                FROM shops 
                WHERE location_id = $1 
                  AND approval_status = 'APPROVED' 
                  AND is_hidden = false 
                ORDER BY is_open DESC, created_at DESC 
                LIMIT 10
            `, [locationId]),

            // 3. Active Contests (Running now)
            query(`
                SELECT id, title, image_url, starts_at, ends_at 
                FROM contests 
                WHERE location_id = $1 
                  AND is_active = true 
                  AND deleted_at IS NULL 
                  AND starts_at <= NOW() 
                  AND ends_at >= NOW()
                LIMIT 3
            `, [locationId]),

            // 4. Upcoming Events
            query(`
                SELECT id, title, image_url, starts_at, location_name 
                FROM events 
                WHERE location_id = $1 
                  AND deleted_at IS NULL 
                  AND starts_at >= NOW()
                ORDER BY starts_at ASC 
                LIMIT 3
            `, [locationId]),

            // 5. Active Service Categories
            query(`
                SELECT id, name, icon_url 
                FROM service_categories 
                WHERE location_id = $1 
                  AND is_active = true 
                ORDER BY name ASC
            `, [locationId]),

            // 6. Latest News
            query(`
                SELECT id, title, image_url, published_at 
                FROM local_news 
                WHERE location_id = $1 
                  AND is_published = true 
                ORDER BY published_at DESC 
                LIMIT 5
            `, [locationId])
        ]);

        if (locationRes.rows.length === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }

        res.json({
            location: locationRes.rows[0],
            shops: shopsRes.rows,
            contests: contestsRes.rows,
            events: eventsRes.rows,
            services: servicesRes.rows,
            news: newsRes.rows
        });

    } catch (err) {
        console.error('Error fetching mobile home data:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
