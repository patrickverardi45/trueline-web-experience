'use client';

// Right pane of the review queue: run header with the before/after redline
// preview, evidence completeness, ticket quantities, mock decision actions,
// and static reviewer comments.

import { Check, Lock, RotateCcw, Undo2 } from 'lucide-react';

import { ft, shortDate } from '@/lib/format';
import { METHOD_LABEL, REVIEW_STATUS } from '@/lib/status';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EvidenceChecklist } from '@/components/ui/EvidenceChecklist';
import { StatusPill } from '@/components/ui/StatusPill';

import { RedlinePreview } from './RedlinePreview';
import type { MockDecision, ReviewItem } from './review-types';

interface MockComment {
  author: string;
  role: string;
  at: string;
  body: string;
}

const COMMENTS: Record<string, MockComment[]> = {
  'r-b04': [
    {
      author: 'L. Hargrove',
      role: 'Inspector · Sample Fiber Co-op',
      at: 'Jun 10',
      body: 'Verify slack loop footage at HH-112 before approval.',
    },
    {
      author: 'Dana Marsh',
      role: 'Crew 02 lead',
      at: 'Jun 10',
      body: '50 ft coiled and photographed — see end evidence at HH-112.',
    },
  ],
  'r-a12': [
    {
      author: 'L. Hargrove',
      role: 'Inspector · Sample Fiber Co-op',
      at: 'Jun 10',
      body: 'Caliche note received. Hold the creek crossing shot until engineering review CR-104 clears.',
    },
  ],
  'r-c02': [
    {
      author: 'L. Hargrove',
      role: 'Inspector · Sample Fiber Co-op',
      at: 'Jun 9',
      body: 'Two obstructions on one segment — include the locates refresh ticket number on resubmittal.',
    },
  ],
  'r-d07': [
    {
      author: 'L. Hargrove',
      role: 'Inspector · Sample Fiber Co-op',
      at: 'Jun 5',
      body: 'Pole transfer sign-offs look complete. Clean submission.',
    },
  ],
};

function PaneTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">{children}</div>
  );
}

interface Props {
  item: ReviewItem;
  decision?: MockDecision;
  onDecide: (decision: MockDecision) => void;
  onReset: () => void;
}

export function ReviewDetail({ item, decision, onDecide, onReset }: Props) {
  const decided = decision !== undefined;
  const status = REVIEW_STATUS[decision ?? item.reviewStatus];
  const comments = COMMENTS[item.runId] ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-ink">{item.runName}</h2>
          <StatusPill meta={status} size="sm" />
        </div>
        <div className="mt-1 text-xs text-ink-3">
          <span className="font-mono text-ink-2">
            {item.fromStationCode} → {item.toStationCode}
          </span>{' '}
          · {METHOD_LABEL[item.method]} · {ft(item.placedFt)} of {ft(item.lengthFt)} placed
        </div>
        <div className="mt-0.5 text-xs text-ink-3">
          Sheet <span className="font-mono text-ink-2">{item.sheetCode}</span> · {item.crewName} —{' '}
          {item.crewLead} · Ticket{' '}
          <span className="font-mono text-ink-2">{item.ticketId.toUpperCase()}</span> ·{' '}
          {shortDate(item.ticketDate)}
        </div>
        <div className="mt-4">
          <RedlinePreview item={item} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <PaneTitle>Evidence completeness</PaneTitle>
          <div className="mt-2">
            <EvidenceChecklist summary={item.evidence} />
          </div>
        </Card>
        <Card flush>
          <div className="px-5 pt-4">
            <PaneTitle>Ticket quantities</PaneTitle>
          </div>
          <table className="mt-1 w-full text-sm">
            <tbody className="divide-y divide-line">
              {item.quantities.map((q) => (
                <tr key={q.label}>
                  <td className="px-5 py-2 text-ink-2">{q.label}</td>
                  <td className="px-5 py-2 text-right font-semibold text-ink">
                    {q.qty.toLocaleString('en-US')}{' '}
                    <span className="font-normal text-ink-3">{q.unit}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-ink-3">
            {item.ticketNotes}
          </p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <PaneTitle>Review decision</PaneTitle>
            <p className="mt-1 text-sm text-ink-2">
              {decided
                ? decision === 'approved'
                  ? 'Approved in this session.'
                  : 'Changes requested in this session.'
                : `Submitted by ${item.crewLead} (${item.crewName}) on ${shortDate(item.ticketDate)}.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => onDecide('approved')} disabled={decided}>
              <Check className="size-4" /> Approve
            </Button>
            <Button
              variant="secondary"
              onClick={() => onDecide('changes-requested')}
              disabled={decided}>
              <Undo2 className="size-4" /> Request changes
            </Button>
            {decided ? (
              <Button variant="ghost" onClick={onReset}>
                <RotateCcw className="size-4" /> Reset mock decision
              </Button>
            ) : null}
          </div>
        </div>
        {decided ? (
          <p className="mt-3 rounded-lg bg-accent-soft/60 px-3 py-2 text-xs font-medium text-accent-strong">
            Mock decision — review workflow connects to the engine later.
          </p>
        ) : null}
      </Card>

      <Card>
        <PaneTitle>Comments</PaneTitle>
        <ul className="mt-3 space-y-3">
          {comments.map((c) => (
            <li key={c.body} className="rounded-lg bg-canvas px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-ink">
                  {c.author} <span className="font-normal text-ink-3">· {c.role}</span>
                </span>
                <span className="shrink-0 text-ink-3">{c.at}</span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{c.body}</p>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            disabled
            placeholder="Comments enabled with backend"
            aria-label="Comments enabled with backend"
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink-3 placeholder:text-ink-3/70 disabled:cursor-not-allowed"
          />
          <Button variant="secondary" size="sm" disabled>
            <Lock className="size-3.5" /> Send
          </Button>
        </div>
      </Card>
    </div>
  );
}
