import type { Metadata } from 'next';
import { Cable, Database, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';

export const metadata: Metadata = { title: 'Settings' };

const ORG_ROWS = [
  { label: 'Organization', value: 'TrueLine Preview Org' },
  { label: 'Market', value: 'OSP / FTTH construction' },
  { label: 'Region', value: 'Central Texas' },
];

const MEMBERS = [
  { name: 'Avery Pruitt', email: 'avery.pruitt@truelinepreview.com', role: 'Admin' },
  { name: 'Cole Whitfield', email: 'cole.whitfield@truelinepreview.com', role: 'Project Manager' },
  { name: 'June Calloway', email: 'june.calloway@truelinepreview.com', role: 'Inspector' },
  { name: 'Dana Marsh', email: 'dana.marsh@truelinepreview.com', role: 'Crew Lead' },
];

const ROLES = [
  {
    role: 'Project Manager',
    scope: 'Full project access — runs, reviews, issues, and closeout assembly',
  },
  {
    role: 'Inspector',
    scope: 'Review + approve — evidence items and field tickets',
  },
  {
    role: 'Crew Lead',
    scope: 'Capture + tickets — field evidence, station drops, and daily logs',
  },
];

const ABOUT_ROWS = [
  { label: 'Product', value: 'TrueLine Web Experience', mono: false },
  { label: 'Version', value: '0.1.0 · contract-first preview', mono: true },
  { label: 'Stack', value: 'Next.js 16 · mock API only — no backend, no auth', mono: false },
];

function PreviewChip() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20">
      Preview
    </span>
  );
}

function ActiveChip() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
      <span className="size-1.5 rounded-full bg-emerald-500" />
      Active
    </span>
  );
}

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        sub="Workspace, members, and integrations — preview build; nothing on this page writes to a backend"
      />

      <div className="space-y-8">
        <section>
          <SectionHeader title="Organization" sub="Workspace identity — static in the preview" />
          <Card flush>
            <dl className="divide-y divide-line">
              {ORG_ROWS.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 px-5 py-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-3">
                    {row.label}
                  </dt>
                  <dd className="text-sm font-medium text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>

        <section>
          <SectionHeader title="Members" sub="Mock roster — invitations are not wired up" />
          <Card flush>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-3">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium">Email</th>
                  <th className="px-3 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {MEMBERS.map((member) => (
                  <tr key={member.email}>
                    <td className="px-5 py-3 font-semibold text-ink">{member.name}</td>
                    <td className="px-3 py-3 font-mono text-xs text-ink-2">{member.email}</td>
                    <td className="px-3 py-3 text-ink-2">{member.role}</td>
                    <td className="px-5 py-3 text-right">
                      <ActiveChip />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-line px-5 py-3 text-xs text-ink-3">
              Member management arrives with auth (later milestone).
            </div>
          </Card>
        </section>

        <section>
          <SectionHeader
            title="Roles & permissions"
            sub="Permission model preview — enforcement lands with auth"
          />
          <Card flush>
            <ul className="divide-y divide-line">
              {ROLES.map((item) => (
                <li key={item.role} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy-900/5 text-navy-700">
                    <ShieldCheck className="size-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink">{item.role}</div>
                    <div className="text-xs text-ink-3">{item.scope}</div>
                  </div>
                  <PreviewChip />
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section>
          <SectionHeader
            title="Integrations"
            sub="What this preview talks to — and what it does not"
          />
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-navy-900/5 text-navy-700">
                  <Cable className="size-5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink">TrueLine v2 engine</h3>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                      <span className="size-1.5 rounded-full bg-amber-500" />
                      Contract mock — not connected
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-3">
                    Redline placement, evidence adjudication, and closeout scoring connect here
                    when the engine integration lands. Until then, every page renders from the
                    shared contracts and mock fixtures.
                  </p>
                  <p className="mt-1.5 font-mono text-xs text-ink-2">
                    contracts v0.1 (16 shared types)
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Button disabled>Connect engine</Button>
                <span className="text-[11px] text-ink-3">
                  Mock action — backend integration arrives later
                </span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-line bg-canvas/60 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy-900/5 text-navy-700">
                  <Database className="size-4" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">Storage / export</div>
                  <div className="text-xs text-ink-3">
                    Closeout packet delivery target — not configured in the preview.
                  </div>
                </div>
              </div>
              <Button variant="secondary" disabled>
                Configure
              </Button>
            </div>
          </Card>
        </section>

        <section>
          <SectionHeader title="About" sub="Build provenance for this preview" />
          <Card flush>
            <dl className="divide-y divide-line">
              {ABOUT_ROWS.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 px-5 py-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-3">
                    {row.label}
                  </dt>
                  <dd
                    className={`text-sm text-ink ${row.mono ? 'font-mono text-xs' : 'font-medium'}`}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>
      </div>
    </div>
  );
}
