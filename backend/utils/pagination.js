exports.parseLimit = (limitQuery) => {
    const parsed = parseInt(limitQuery);
    if (isNaN(parsed) || parsed < 1) return 20;
    if (parsed > 50) return 50;
    return parsed;
};

exports.parseCursor = (cursorQuery) => {
    if (!cursorQuery) return null;
    const parts = cursorQuery.split('|');
    if (parts.length !== 2) return null;
    return { created_at: parts[0], id: parts[1] };
};

exports.makeNextCursor = (rows, limit) => {
    if (rows.length === 0 || rows.length < limit) return null;
    const lastRow = rows[rows.length - 1];
    const dateStr = lastRow.created_at instanceof Date ? lastRow.created_at.toISOString() : lastRow.created_at;
    return `${dateStr}|${lastRow.id}`;
};