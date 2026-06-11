/**
 * Live Google Meet transcript ingestion.
 *
 * Reads the most recent conference record's transcript via the Google Meet REST
 * API v2 and returns it in the same shape as fixtures/meet-transcript.json, so
 * the rest of the pipeline is unchanged. Falls back to the fixture when Google
 * OAuth credentials are absent (the demo path, and when you have no keys yet).
 *
 * NOTE: this live path is implemented to the Meet API spec but is NOT verified
 * against a real Google Workspace (requires OAuth credentials + a meeting that
 * had transcription on). The fixture fallback is what the demo uses and what is
 * verified.
 *
 * Requires OAuth scope: https://www.googleapis.com/auth/meetings.space.readonly
 */
const config = require('../config');
const meetFixture = require('../../fixtures/meet-transcript.json');

const hasGoogle = Boolean(
  config.google.clientId && config.google.clientSecret && config.google.refreshToken
);

async function accessToken() {
  const axios = require('axios');
  const { data } = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    refresh_token: config.google.refreshToken,
    grant_type: 'refresh_token',
  });
  return data.access_token;
}

/**
 * @returns {Promise<object>} a meet transcript in fixture shape
 *   { meeting, date, participants, transcript: [{ speaker, text }] }
 */
async function fetchMeetTranscript() {
  if (!hasGoogle) return meetFixture; // demo / no keys → fixture

  const axios = require('axios');
  const token = await accessToken();
  const h = { Authorization: `Bearer ${token}` };
  const base = 'https://meet.googleapis.com/v2';

  // most recent conference record
  const cr = await axios.get(`${base}/conferenceRecords?pageSize=1`, { headers: h });
  const record = (cr.data.conferenceRecords || [])[0];
  if (!record) return meetFixture;

  const tr = await axios.get(`${base}/${record.name}/transcripts`, { headers: h });
  const transcript = (tr.data.transcripts || [])[0];
  if (!transcript) return meetFixture;

  const en = await axios.get(`${base}/${transcript.name}/entries?pageSize=200`, { headers: h });
  const entries = en.data.transcriptEntries || [];

  // resolve participant resource names → display names (cached)
  const names = {};
  async function nameOf(participant) {
    if (!participant) return 'speaker';
    if (names[participant]) return names[participant];
    try {
      const { data } = await axios.get(`${base}/${participant}`, { headers: h });
      const n =
        data.signedinUser?.displayName || data.anonymousUser?.displayName || 'speaker';
      names[participant] = n;
      return n;
    } catch {
      return 'speaker';
    }
  }

  const lines = [];
  for (const e of entries) {
    if (!e.text || !e.text.trim()) continue;
    lines.push({ speaker: await nameOf(e.participant), text: e.text.trim() });
  }
  if (!lines.length) return meetFixture;

  return {
    meeting: 'Google Meet',
    date: record.startTime,
    participants: [...new Set(lines.map((l) => l.speaker))],
    transcript: lines,
  };
}

module.exports = { fetchMeetTranscript, hasGoogle };
