// Closeout readiness + packet fixtures, derived from evidence completeness.

import type { CloseoutPacket, CloseoutReadiness } from '@/contracts';

export const readinessByProject: Record<string, CloseoutReadiness> = {
  'demo-project-001': {
    projectId: 'demo-project-001',
    score: 65,
    updatedAt: '2026-06-10T14:40:00-05:00',
    runsReady: ['r-d07'],
    runsBlocked: ['r-c02'],
    runsInProgress: ['r-a12', 'r-a13', 'r-b04'],
    missing: [
      { runId: 'r-a12', kind: 'end', description: 'End evidence not captured at HH-105' },
      { runId: 'r-a12', kind: 'ticket', description: 'Ticket T-1042 still in draft' },
      { runId: 'r-a13', kind: 'start', description: 'Start evidence not captured' },
      { runId: 'r-a13', kind: 'ticket', description: 'No field ticket created' },
      { runId: 'r-a13', kind: 'bore-log', description: 'Bore log not linked' },
      { runId: 'r-b04', kind: 'redline', description: 'Redline approval pending (in review)' },
      { runId: 'r-c02', kind: 'end', description: 'End evidence not captured at PED-311' },
      { runId: 'r-c02', kind: 'ticket', description: 'Ticket T-1040 still in draft' },
    ],
    runs: [
      { runId: 'r-a12', score: 55, missing: [
        { runId: 'r-a12', kind: 'end', description: 'End evidence not captured at HH-105' },
        { runId: 'r-a12', kind: 'ticket', description: 'Ticket T-1042 still in draft' },
      ], blockedBy: [] },
      { runId: 'r-a13', score: 10, missing: [
        { runId: 'r-a13', kind: 'start', description: 'Start evidence not captured' },
        { runId: 'r-a13', kind: 'ticket', description: 'No field ticket created' },
        { runId: 'r-a13', kind: 'bore-log', description: 'Bore log not linked' },
      ], blockedBy: [] },
      { runId: 'r-b04', score: 92, missing: [
        { runId: 'r-b04', kind: 'redline', description: 'Redline approval pending (in review)' },
      ], blockedBy: [] },
      { runId: 'r-c02', score: 35, missing: [
        { runId: 'r-c02', kind: 'end', description: 'End evidence not captured at PED-311' },
        { runId: 'r-c02', kind: 'ticket', description: 'Ticket T-1040 still in draft' },
      ], blockedBy: ['i-102', 'i-103'] },
      { runId: 'r-d07', score: 100, missing: [], blockedBy: [] },
    ],
  },
  'demo-project-002': {
    projectId: 'demo-project-002',
    score: 27,
    updatedAt: '2026-06-09T16:15:00-05:00',
    runsReady: [],
    runsBlocked: [],
    runsInProgress: ['r-m01', 'r-m02'],
    missing: [
      { runId: 'r-m01', kind: 'end', description: 'End evidence not captured' },
      { runId: 'r-m01', kind: 'ticket', description: 'Ticket T-2007 still in draft' },
      { runId: 'r-m02', kind: 'start', description: 'Start evidence not captured' },
      { runId: 'r-m02', kind: 'ticket', description: 'No field ticket created' },
    ],
    runs: [
      { runId: 'r-m01', score: 45, missing: [
        { runId: 'r-m01', kind: 'end', description: 'End evidence not captured' },
        { runId: 'r-m01', kind: 'ticket', description: 'Ticket T-2007 still in draft' },
      ], blockedBy: [] },
      { runId: 'r-m02', score: 8, missing: [
        { runId: 'r-m02', kind: 'start', description: 'Start evidence not captured' },
        { runId: 'r-m02', kind: 'ticket', description: 'No field ticket created' },
      ], blockedBy: [] },
    ],
  },
  'demo-project-003': {
    projectId: 'demo-project-003',
    score: 100,
    updatedAt: '2026-06-05T09:20:00-05:00',
    runsReady: ['r-l11', 'r-l12'],
    runsBlocked: [],
    runsInProgress: [],
    missing: [],
    runs: [
      { runId: 'r-l11', score: 100, missing: [], blockedBy: [] },
      { runId: 'r-l12', score: 100, missing: [], blockedBy: [] },
    ],
  },
};

export const packetsByProject: Record<string, CloseoutPacket> = {
  'demo-project-001': {
    id: 'pk-001',
    projectId: 'demo-project-001',
    name: 'Demo Project 001 — v2 staging — Closeout Packet',
    status: 'draft',
    sections: [
      { id: 'ps-cover', title: 'Cover & certification', kind: 'cover', itemCount: 1, included: true, ready: true },
      { id: 'ps-asbuilts', title: 'As-built plan sheets', kind: 'as-builts', itemCount: 5, included: true, ready: false },
      { id: 'ps-redlines', title: 'Approved redlines', kind: 'redlines', itemCount: 4, included: true, ready: false },
      { id: 'ps-borelogs', title: 'Bore logs', kind: 'bore-logs', itemCount: 1, included: true, ready: true },
      { id: 'ps-photos', title: 'Evidence photos', kind: 'photos', itemCount: 14, included: true, ready: true },
      { id: 'ps-tickets', title: 'Field tickets', kind: 'tickets', itemCount: 4, included: true, ready: false },
      { id: 'ps-logs', title: 'Daily logs', kind: 'daily-logs', itemCount: 3, included: true, ready: true },
      { id: 'ps-qty', title: 'Quantity summary', kind: 'quantities', itemCount: 1, included: true, ready: true },
    ],
  },
  'demo-project-003': {
    id: 'pk-003',
    projectId: 'demo-project-003',
    name: 'Demo Project 003 — Closeout Packet',
    status: 'ready',
    generatedAt: '2026-06-05T09:20:00-05:00',
    sections: [
      { id: 'po-cover', title: 'Cover & certification', kind: 'cover', itemCount: 1, included: true, ready: true },
      { id: 'po-asbuilts', title: 'As-built plan sheets', kind: 'as-builts', itemCount: 1, included: true, ready: true },
      { id: 'po-redlines', title: 'Approved redlines', kind: 'redlines', itemCount: 2, included: true, ready: true },
      { id: 'po-photos', title: 'Evidence photos', kind: 'photos', itemCount: 4, included: true, ready: true },
      { id: 'po-tickets', title: 'Field tickets', kind: 'tickets', itemCount: 2, included: true, ready: true },
      { id: 'po-qty', title: 'Quantity summary', kind: 'quantities', itemCount: 1, included: true, ready: true },
    ],
  },
};
