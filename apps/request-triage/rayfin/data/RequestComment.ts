import { date, entity, role, text, uuid } from '@microsoft/rayfin-core';

/**
 * A comment on a request. Everyone reads; you can only post as yourself (authorSub = your sub).
 * Comments are not edited or deleted, so the conversation stays a faithful record.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.sub.eq(item.authorSub),
})
export class RequestComment {
  @uuid() id!: string;
  @uuid() requestId!: string;
  @text({ min: 1, max: 255 }) authorSub!: string;
  @text({ min: 1, max: 100 }) authorName!: string;
  @text({ min: 1, max: 600 }) body!: string;
  @date() createdAt!: Date;
}
