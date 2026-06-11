// Redline Playback fixtures — the day's events on a run, ordered, with a
// 0–1 progress position along the run's map path.

import type { RedlinePlaybackStep } from '@/contracts';

export const playbackSteps: RedlinePlaybackStep[] = [
  // --- Run A-12: in progress, today ---
  { id: 'pb-a12-1', runId: 'r-a12', seq: 1, at: '2026-06-10T07:15:00-05:00', kind: 'mobilize', progress: 0, note: 'Crew 02 on site at HH-104. Bore rig staged.' },
  { id: 'pb-a12-2', runId: 'r-a12', seq: 2, at: '2026-06-10T07:42:00-05:00', kind: 'start-evidence', progress: 0, stationCode: 'HH-104', note: 'Start evidence captured — 2 photos, GPS tagged.', evidenceId: 'ev-a12-start' },
  { id: 'pb-a12-3', runId: 'r-a12', seq: 3, at: '2026-06-10T09:30:00-05:00', kind: 'advance', progress: 0.25, stationCode: 'STA 2+20', note: 'Bore head at STA 2+20 — 220 ft drilled.' },
  { id: 'pb-a12-4', runId: 'r-a12', seq: 4, at: '2026-06-10T10:15:00-05:00', kind: 'station-drop', progress: 0.318, stationCode: 'STA 2+80', note: 'Station dropped with GPS.', evidenceId: 'ev-a12-st280' },
  { id: 'pb-a12-5', runId: 'r-a12', seq: 5, at: '2026-06-10T11:48:00-05:00', kind: 'problem', progress: 0.386, stationCode: 'STA 3+40', note: 'Caliche — production slowed. Problem area flagged with photos.', evidenceId: 'ev-a12-prob' },
  { id: 'pb-a12-6', runId: 'r-a12', seq: 6, at: '2026-06-10T13:40:00-05:00', kind: 'advance', progress: 0.5, stationCode: 'STA 4+40', note: 'Grinding through caliche — STA 4+40.' },
  { id: 'pb-a12-7', runId: 'r-a12', seq: 7, at: '2026-06-10T14:35:00-05:00', kind: 'station-drop', progress: 0.591, stationCode: 'STA 5+20', note: 'Station dropped with GPS. End of shift position.', evidenceId: 'ev-a12-st520' },

  // --- Run D-07: complete arc, including review ---
  { id: 'pb-d07-1', runId: 'r-d07', seq: 1, at: '2026-06-04T07:30:00-05:00', kind: 'start-evidence', progress: 0, stationCode: 'PL-77', note: 'Start evidence captured at PL-77.', evidenceId: 'ev-d07-start' },
  { id: 'pb-d07-2', runId: 'r-d07', seq: 2, at: '2026-06-04T10:20:00-05:00', kind: 'advance', progress: 0.4, stationCode: 'PL-79', note: 'Strand set through PL-79.' },
  { id: 'pb-d07-3', runId: 'r-d07', seq: 3, at: '2026-06-04T13:45:00-05:00', kind: 'advance', progress: 0.75, stationCode: 'PL-81', note: 'Lashing complete through PL-81.' },
  { id: 'pb-d07-4', runId: 'r-d07', seq: 4, at: '2026-06-04T16:10:00-05:00', kind: 'end-evidence', progress: 1, stationCode: 'PL-82', note: 'End evidence captured at PL-82.', evidenceId: 'ev-d07-end' },
  { id: 'pb-d07-5', runId: 'r-d07', seq: 5, at: '2026-06-04T16:40:00-05:00', kind: 'submit', progress: 1, note: 'Ticket T-1031 submitted with 6 pole transfers.' },
  { id: 'pb-d07-6', runId: 'r-d07', seq: 6, at: '2026-06-05T09:10:00-05:00', kind: 'review', progress: 1, note: 'Reviewed and approved. Run ready for closeout.' },

  // --- Run B-04: complete, awaiting review ---
  { id: 'pb-b04-1', runId: 'r-b04', seq: 1, at: '2026-06-09T08:05:00-05:00', kind: 'start-evidence', progress: 0, stationCode: 'VLT-201', note: 'Start evidence captured at the vault.', evidenceId: 'ev-b04-start' },
  { id: 'pb-b04-2', runId: 'r-b04', seq: 2, at: '2026-06-09T12:30:00-05:00', kind: 'advance', progress: 0.55, note: 'Pull past the Cedar Ridge Rd crossing.' },
  { id: 'pb-b04-3', runId: 'r-b04', seq: 3, at: '2026-06-09T15:50:00-05:00', kind: 'end-evidence', progress: 1, stationCode: 'HH-112', note: 'End evidence captured. Slack loops verified.', evidenceId: 'ev-b04-end' },
  { id: 'pb-b04-4', runId: 'r-b04', seq: 4, at: '2026-06-09T16:20:00-05:00', kind: 'submit', progress: 1, note: 'Ticket T-1038 submitted — now in review.' },
];
