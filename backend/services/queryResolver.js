const fs = require('fs');
const path = require('path');

const ENABLE_LLM_FALLBACK = /^true$/i.test(process.env.ENABLE_LLM_FALLBACK || 'false');
const DEBUG_QUERY_RESOLVER = /^true$/i.test(process.env.DEBUG_QUERY_RESOLVER || 'false');
const FUZZY_MIN_THRESHOLD = Number(process.env.QUERY_FUZZY_THRESHOLD || 0.72);

const ALIASES_DIR = path.join(__dirname, '..', 'data', 'aliases');
const LEGACY_ALIASES_FILE = path.join(__dirname, '..', 'data', 'itemAliases.json');
const FILE_PRIORITY = [
    'vegetables.json', 'fruits.json', 'groceries.json', 'spices_masalas.json', 'dairy_bakery.json',
    'snacks_beverages.json', 'pickles_podis.json', 'household_cleaning.json', 'personal_care.json',
    'baby_care.json', 'stationary.json', 'fancy_store.json', 'disposable_party.json', 'hotel_tiffin.json',
    'electrical.json', 'plumbing.json', 'tools_hardware.json'
];

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

function debugWarn(message, context) {
    if (!DEBUG_QUERY_RESOLVER) {
        return;
    }

    console.warn('[QueryResolver]', message, context || {});
}

function safeLoadJson(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            debugWarn('Skipping aliases file with invalid root object.', { file: path.basename(filePath) });
            return null;
        }

        return parsed;
    } catch (error) {
        debugWarn('Skipping aliases file due to read/parse failure.', {
            file: path.basename(filePath),
            error: error && error.message ? error.message : 'Unknown error'
        });
        return null;
    }
}

function loadAliasesFromFolder() {
    if (!fs.existsSync(ALIASES_DIR)) {
        return null;
    }

    let folderEntries;
    try {
        folderEntries = fs.readdirSync(ALIASES_DIR);
    } catch (error) {
        debugWarn('Unable to read aliases folder.', {
            folder: ALIASES_DIR,
            error: error && error.message ? error.message : 'Unknown error'
        });
        return null;
    }

    const jsonFiles = folderEntries.filter((fileName) => fileName.endsWith('.json'));
    if (jsonFiles.length === 0) {
        return null;
    }

    const fileOrder = [
        ...FILE_PRIORITY.filter((fileName) => jsonFiles.includes(fileName)),
        ...jsonFiles.filter((fileName) => !FILE_PRIORITY.includes(fileName)).sort()
    ];

    const mergedAliases = {};
    const canonicalOrder = new Map();
    let canonicalCounter = 0;

    fileOrder.forEach((fileName) => {
        const filePath = path.join(ALIASES_DIR, fileName);
        const parsed = safeLoadJson(filePath);

        if (!parsed) {
            return;
        }

        Object.entries(parsed).forEach(([canonical, aliases]) => {
            if (typeof canonical !== 'string') {
                return;
            }

            const canonicalKey = canonical.trim();
            if (!canonicalKey) {
                return;
            }

            if (!canonicalOrder.has(canonicalKey)) {
                canonicalOrder.set(canonicalKey, canonicalCounter);
                canonicalCounter += 1;
            }

            if (!Array.isArray(aliases)) {
                debugWarn('Skipping canonical aliases that are not an array.', {
                    file: fileName,
                    canonical: canonicalKey
                });
                return;
            }

            if (!mergedAliases[canonicalKey]) {
                mergedAliases[canonicalKey] = [];
            }

            const mergedSet = new Set(mergedAliases[canonicalKey]);
            aliases.forEach((alias) => {
                if (typeof alias !== 'string') {
                    return;
                }

                const trimmedAlias = alias.trim();
                if (!trimmedAlias) {
                    return;
                }

                mergedSet.add(trimmedAlias);
            });
            mergedAliases[canonicalKey] = Array.from(mergedSet);
        });
    });

    if (Object.keys(mergedAliases).length === 0) {
        return null;
    }

    return {
        itemAliases: mergedAliases,
        canonicalOrder
    };
}

function loadLegacyAliases() {
    const parsed = safeLoadJson(LEGACY_ALIASES_FILE);
    if (!parsed) {
        return {
            itemAliases: {},
            canonicalOrder: new Map()
        };
    }

    const canonicalOrder = new Map();
    let index = 0;
    Object.keys(parsed).forEach((canonical) => {
        canonicalOrder.set(canonical, index);
        index += 1;
    });

    return {
        itemAliases: parsed,
        canonicalOrder
    };
}

function loadItemAliases() {
    const folderAliases = loadAliasesFromFolder();
    if (folderAliases) {
        return folderAliases;
    }

    return loadLegacyAliases();
}

const { itemAliases, canonicalOrder } = loadItemAliases();

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

function isPreferredCanonical(currentCanonical, nextCanonical) {
    const currentOrder = canonicalOrder.has(currentCanonical)
        ? canonicalOrder.get(currentCanonical)
        : Number.MAX_SAFE_INTEGER;
    const nextOrder = canonicalOrder.has(nextCanonical)
        ? canonicalOrder.get(nextCanonical)
        : Number.MAX_SAFE_INTEGER;

    return nextOrder < currentOrder;
}

function buildAliasIndex() {
    const index = new Map();

    Object.entries(itemAliases).forEach(([canonical, aliases]) => {
        const canonicalNorm = normalizeQuery(canonical);
        if (canonicalNorm && !index.has(canonicalNorm)) {
            index.set(canonicalNorm, canonical);
        }

        if (!Array.isArray(aliases)) {
            return;
        }

        aliases.forEach((alias) => {
            const normalizedAlias = normalizeQuery(alias);
            if (!normalizedAlias) {
                return;
            }

            const existingCanonical = index.get(normalizedAlias);
            if (!existingCanonical) {
                index.set(normalizedAlias, canonical);
                return;
            }

            if (existingCanonical === canonical) {
                return;
            }

            if (isPreferredCanonical(existingCanonical, canonical)) {
                debugWarn('Duplicate alias normalized mapping detected; choosing preferred canonical.', {
                    alias: normalizedAlias,
                    chosenCanonical: canonical,
                    skippedCanonical: existingCanonical
                });
                index.set(normalizedAlias, canonical);
                return;
            }

            debugWarn('Duplicate alias normalized mapping detected; keeping existing canonical.', {
                alias: normalizedAlias,
                chosenCanonical: existingCanonical,
                skippedCanonical: canonical
            });
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
            const candidates = Array.isArray(aliases) ? [canonical, ...aliases] : [canonical];
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
