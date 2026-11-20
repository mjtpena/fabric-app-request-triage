import { date, entity, role, set, text, uuid } from '@microsoft/rayfin-core';

const statuses = ['new', 'triaged', 'planned', 'in_progress', 'delivered', 'declined'] as const;
type Status = (typeof statuses)[number];

/**
 * Append-only status trail. Everyone reads; rows can be created (only attributed to yourself: bySub = your sub)
 * but never updated or deleted. fromStatus is empty on the first row, written when the request is submitted.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.sub.eq(item.bySub),
})
export class StatusChange {
  @uuid() id!: string;
  @uuid() requestId!: string;
  @set({ enum: [...statuses], optional: true }) fromStatus?: Status;
  @set(...statuses) toStatus!: Status;
  @text({ min: 1, max: 255 }) bySub!: string;
  @text({ min: 1, max: 100 }) byName!: string;
  @text({ max: 300, optional: true }) note?: string;
  @date() at!: Date;
}
