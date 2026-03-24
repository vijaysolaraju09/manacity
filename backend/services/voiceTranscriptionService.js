const { createError } = require('../utils/errors');

const SUPPORTED_AUDIO_MIME_TYPES = new Set([
    'audio/m4a',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'audio/ogg',
    'video/mp4',
    'video/quicktime',
    'application/octet-stream'
]);

const DEFAULT_MODEL = process.env.OPENAI_AUDIO_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
const MAX_VOICE_FILE_BYTES = Number(process.env.VOICE_AUDIO_MAX_BYTES || (10 * 1024 * 1024));

function validateVoiceFile(audioFile) {
    if (!audioFile || !audioFile.buffer || audioFile.size <= 0) {
        throw createError(400, 'VOICE_AUDIO_REQUIRED', 'Audio is required');
    }

    if (audioFile.size > MAX_VOICE_FILE_BYTES) {
        throw createError(400, 'VOICE_AUDIO_INVALID', 'Invalid audio input');
    }

    if (audioFile.mimetype && !SUPPORTED_AUDIO_MIME_TYPES.has(audioFile.mimetype)) {
        throw createError(400, 'VOICE_AUDIO_INVALID', 'Invalid audio input');
    }
}

async function transcribeVoiceFile(audioFile) {
    validateVoiceFile(audioFile);

    if (!process.env.OPENAI_API_KEY) {
        throw createError(500, 'VOICE_TRANSCRIPTION_FAILED', 'Could not understand audio');
    }

    const form = new FormData();
    const model = process.env.OPENAI_AUDIO_TRANSCRIBE_MODEL || DEFAULT_MODEL;
    const fileName = audioFile.originalname || 'voice-search.m4a';
    const mimeType = audioFile.mimetype || 'audio/m4a';

    form.append('model', model);
    form.append('language', 'te');
    form.append('file', new Blob([audioFile.buffer], { type: mimeType }), fileName);

    let response;
    try {
        response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: form
        });
    } catch (error) {
        throw createError(502, 'VOICE_TRANSCRIPTION_FAILED', 'Could not understand audio');
    }

    if (!response.ok) {
        throw createError(502, 'VOICE_TRANSCRIPTION_FAILED', 'Could not understand audio');
    }

    const payload = await response.json();
    const transcript = payload && typeof payload.text === 'string'
        ? payload.text.trim()
        : '';

    if (!transcript) {
        throw createError(422, 'VOICE_TRANSCRIPTION_FAILED', 'Could not understand audio');
    }

    return transcript;
}

module.exports = {
    transcribeVoiceFile,
    validateVoiceFile
};
