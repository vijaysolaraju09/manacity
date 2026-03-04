const itemAliases = require('../data/itemAliases.json');

const ENABLE_LLM_FALLBACK = /^true$/i.test(process.env.ENABLE_LLM_FALLBACK || 'false');
const DEBUG_QUERY_RESOLVER = /^true$/i.test(process.env.DEBUG_QUERY_RESOLVER || 'false');
const FUZZY_MIN_THRESHOLD = Number(process.env.QUERY_FUZZY_THRESHOLD || 0.72);

function normalizeQuery(q) {
    if (typeof q !== 'string') {
        return '';
    }

    return q
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const dp = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j += 1) {
        dp[j] = j;
    }

    for (let i = 1; i <= a.length; i += 1) {
        let prevDiagonal = dp[0];
        dp[0] = i;

        for (let j = 1; j <= b.length; j += 1) {
            const temp = dp[j];
            const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;

            dp[j] = Math.min(
                dp[j] + 1,
                dp[j - 1] + 1,
                prevDiagonal + substitutionCost
            );

            prevDiagonal = temp;
        }
    }

    return dp[b.length];
}

function tokenSetSimilarity(a, b) {
    const aTokens = new Set(a.split(' ').filter(Boolean));
    const bTokens = new Set(b.split(' ').filter(Boolean));

    if (!aTokens.size || !bTokens.size) {
        return 0;
    }

    let intersection = 0;
    aTokens.forEach((token) => {
        if (bTokens.has(token)) {
            intersection += 1;
        }
    });

    const union = aTokens.size + bTokens.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

function aliasScore(query, alias) {
    if (!query || !alias) {
        return 0;
    }

    if (query === alias) {
        return 1;
    }

    const maxLen = Math.max(query.length, alias.length);
    const distance = levenshtein(query, alias);
    const editSimilarity = maxLen === 0 ? 0 : 1 - (distance / maxLen);
    const tokenSimilarity = tokenSetSimilarity(query, alias);

    return (editSimilarity * 0.75) + (tokenSimilarity * 0.25);
}

function buildAliasIndex() {
    const index = new Map();

    Object.entries(itemAliases).forEach(([canonical, aliases]) => {
        const canonicalNorm = normalizeQuery(canonical);
        if (canonicalNorm) {
            index.set(canonicalNorm, canonical);
        }

        aliases.forEach((alias) => {
            const normalizedAlias = normalizeQuery(alias);
            if (normalizedAlias) {
                index.set(normalizedAlias, canonical);
            }
        });
    });

    return index;
}

const aliasIndex = buildAliasIndex();

function getSynonyms(canonical) {
    if (!canonical || !itemAliases[canonical]) {
        return [];
    }

    return Array.from(new Set([canonical, ...itemAliases[canonical]]));
}

function clampConfidence(score) {
    return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

function debugLog(normalizedQuery, resolution) {
    if (!DEBUG_QUERY_RESOLVER) {
        return;
    }

    console.debug('[QueryResolver]', {
        normalizedQuery,
        canonical: resolution.canonical,
        confidence: resolution.confidence,
        source: resolution.source
    });
}

function llmResolveFallback(normalizedQuery) {
    const hasApiKey = Boolean(process.env.LLM_API_KEY);

    if (!hasApiKey) {
        return null;
    }

    // Stubbed LLM resolver contract. Replace with actual provider integration when key & endpoint are configured.
    // Must return JSON-only shape: { canonical: string|null, confidence: number }
    const strictShape = {
        canonical: null,
        confidence: 0
    };

    if (typeof normalizedQuery !== 'string' || !normalizedQuery) {
        return strictShape;
    }

    return strictShape;
}

function resolveQuery(q) {
    const normalizedQuery = normalizeQuery(q);

    if (!normalizedQuery) {
        const emptyResult = {
            canonical: null,
            synonyms: [],
            confidence: 0,
            source: 'none',
            suggestions: []
        };
        debugLog(normalizedQuery, emptyResult);
        return emptyResult;
    }

    const exactCanonical = aliasIndex.get(normalizedQuery);
    if (exactCanonical) {
        const exactResult = {
            canonical: exactCanonical,
            synonyms: getSynonyms(exactCanonical),
            confidence: 0.95,
            source: 'exact'
        };
        debugLog(normalizedQuery, exactResult);
        return exactResult;
    }

    const rankedCanonicals = Object.entries(itemAliases)
        .map(([canonical, aliases]) => {
            const candidates = [canonical, ...aliases];
            let best = 0;

            candidates.forEach((candidate) => {
                const candidateNorm = normalizeQuery(candidate);
                const score = aliasScore(normalizedQuery, candidateNorm);
                if (score > best) {
                    best = score;
                }
            });

            return { canonical, score: clampConfidence(best) };
        })
        .sort((a, b) => b.score - a.score);

    const topMatch = rankedCanonicals[0];
    if (topMatch && topMatch.score >= FUZZY_MIN_THRESHOLD) {
        const fuzzyResult = {
            canonical: topMatch.canonical,
            synonyms: getSynonyms(topMatch.canonical),
            confidence: topMatch.score,
            source: 'fuzzy'
        };
        debugLog(normalizedQuery, fuzzyResult);
        return fuzzyResult;
    }

    if (ENABLE_LLM_FALLBACK) {
        const llmResult = llmResolveFallback(normalizedQuery);
        if (
            llmResult &&
            (llmResult.canonical === null || typeof llmResult.canonical === 'string') &&
            typeof llmResult.confidence === 'number'
        ) {
            const canonical = llmResult.canonical && itemAliases[llmResult.canonical]
                ? llmResult.canonical
                : null;

            if (canonical) {
                const resolvedByLlm = {
                    canonical,
                    synonyms: getSynonyms(canonical),
                    confidence: clampConfidence(llmResult.confidence),
                    source: 'llm'
                };
                debugLog(normalizedQuery, resolvedByLlm);
                return resolvedByLlm;
            }
        }
    }

    const noneResult = {
        canonical: null,
        synonyms: [],
        confidence: 0,
        source: 'none',
        suggestions: rankedCanonicals.slice(0, 3).map((item) => ({
            canonical: item.canonical,
            confidence: item.score
        }))
    };

    debugLog(normalizedQuery, noneResult);
    return noneResult;
}

module.exports = {
    normalizeQuery,
    resolveQuery
};
