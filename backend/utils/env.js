exports.validateEnv = () => {
    const requiredVars = [
        'NODE_ENV',
        'PORT',
        'JWT_SECRET',
        'JWT_EXPIRES_IN',
        'S3_REGION',
        'S3_BUCKET',
        'S3_ACCESS_KEY',
        'S3_SECRET_KEY',
        'S3_ENDPOINT'
    ];

    const missingVars = requiredVars.filter(key => !process.env[key]);

    // Check DB connection vars (either DATABASE_URL or PG* vars)
    const hasDbUrl = !!process.env.DATABASE_URL;
    const hasPgVars = process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE;

    if (!hasDbUrl && !hasPgVars) {
        missingVars.push('DATABASE_URL or (PGHOST, PGUSER, PGPASSWORD, PGDATABASE)');
    }

    if (missingVars.length > 0) {
        console.error('FATAL ERROR: Missing required environment variables:');
        missingVars.forEach(key => console.error(` - ${key}`));
        process.exit(1);
    }
};