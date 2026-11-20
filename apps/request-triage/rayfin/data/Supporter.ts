import { date, entity, role, uuid, text } from '@microsoft/rayfin-core';

/**
 * A "me too" on a request. One per user per request (checked in src/domain/requests.ts; duplicates are counted once, see src/domain/integrity.ts).
 * Everyone reads; you can only add or remove your own support (voterSub = your sub). No updates.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', ['create', 'delete'], {
  policy: (claims, item) => claims.sub.eq(item.voterSub),
})
export class Supporter {
  @uuid() id!: string;
  @uuid() requestId!: string;
  @text({ min: 1, max: 255 }) voterSub!: string;
  @date() createdAt!: Date;
}
