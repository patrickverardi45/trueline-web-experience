import type { Metadata } from 'next';

import type { CloseoutPacket, Project } from '@/contracts';
import { api } from '@/lib/api';
import { PacketBuilder } from './PacketBuilder';
import type { PacketBundle } from './PacketBuilder';

export const metadata: Metadata = { title: 'Packet Builder' };

const PACKET_PROJECT_IDS = ['demo-project-001', 'demo-project-003'] as const;

export default async function PacketPage() {
  const loaded = await Promise.all(
    PACKET_PROJECT_IDS.map(async (projectId) => {
      const [packet, project] = await Promise.all([
        api.closeout.packet(projectId),
        api.projects.get(projectId),
      ]);
      return { packet, project };
    }),
  );

  const bundles = loaded.filter(
    (b): b is { packet: CloseoutPacket; project: Project } =>
      b.packet !== undefined && b.project !== undefined,
  ) satisfies PacketBundle[];

  return <PacketBuilder bundles={bundles} />;
}
