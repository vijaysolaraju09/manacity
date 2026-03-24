const { normalizeQuery } = require('./queryResolver');

const PHRASE_NORMALIZATIONS = [
    ['erra gaddalu', 'onion'],
    ['erra gadda', 'onion'],
    ['erragaddalu', 'onion'],
    ['erragadda', 'onion'],
    ['ulli payalu', 'onion'],
    ['ullipayalu', 'onion'],
    ['ulligaddalu', 'onion'],
    ['ulligadda', 'onion'],
    ['ulli gadda', 'onion'],
    ['tamata', 'tomato'],
    ['tamota', 'tomato'],
    ['tamotaalu', 'tomato'],
    ['tamatalu', 'tomato'],
    ['bangala dumpa', 'potato'],
    ['bangaladumpa', 'potato'],
    ['bangaladumpalu', 'potato'],
    ['aloo', 'potato'],
    ['pachi mirchi', 'green chilli'],
    ['pachimirchi', 'green chilli'],
    ['mirapakayalu', 'green chilli'],
    ['mirapakay', 'green chilli'],
    ['mirchi', 'green chilli'],
    ['kottimeera', 'coriander leaves'],
    ['kothimeera', 'coriander leaves'],
    ['kottimira', 'coriander leaves'],
    ['kothimira', 'coriander leaves'],
    ['sorakaya', 'bottle gourd'],
    ['lauki', 'bottle gourd'],
    ['beerakaya', 'ridge gourd'],
    ['turai', 'ridge gourd'],
    ['bendakaya', 'okra'],
    ['bendakayalu', 'okra'],
    ['dosakaya', 'cucumber'],
    ['vankaya', 'brinjal'],
    ['vankayalu', 'brinjal'],
    ['gongura', 'gongura'],
    ['majjiga', 'buttermilk'],
    ['majiga', 'buttermilk'],
    ['pappu', 'dal'],
    ['biyyam', 'rice'],
    ['nune', 'oil'],
    ['noone', 'oil'],
    ['neyyi', 'ghee'],
    ['bellam', 'jaggery'],
    ['chintapandu', 'tamarind'],
    ['pesara pappu', 'moong dal'],
    ['kandi pappu', 'toor dal'],
    ['minapa pappu', 'urad dal'],
    ['senaga pappu', 'chana dal'],
    ['janthikalu', 'murukulu'],
    ['murukulu', 'murukulu'],
    ['mixchar', 'mixture'],
    ['mixtur', 'mixture']
];

function normalizeVoiceQuery(rawTranscript) {
    const base = normalizeQuery(rawTranscript);
    if (!base) {
        return '';
    }

    const padded = ` ${base} `;
    const normalized = PHRASE_NORMALIZATIONS.reduce((acc, [source, target]) => {
        const sourceNorm = normalizeQuery(source);
        if (!sourceNorm) {
            return acc;
        }

        const pattern = new RegExp(`\\b${sourceNorm.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'g');
        return acc.replace(pattern, target);
    }, padded);

    return normalized.replace(/\s+/g, ' ').trim();
}

module.exports = {
    normalizeVoiceQuery
};
