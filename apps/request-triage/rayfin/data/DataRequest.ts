import { date, entity, int, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * A "can you get me this data" request.
 *
 * Security:
 * - Everyone signed in reads every request (the queue is public by design).
 * - Create: only as yourself (requesterSub = your sub), only in status "new", and only the requester fields. Triage
 *   fields (effort, assigneeName, targetDate, declineReason, duplicateOfId) cannot be set on create.
 * - Update: the owner columns (requesterSub, requesterName, createdAt) can never change. The policy DSL cannot say
 *   "the requester OR a data-team member" (there is no admin claim), so the row policy cannot be owner-only without
 *   locking the data team out of triage. Who may change which field is enforced in src/domain/requests.ts:
 *   requester fields by the requester only (description only once triaged), triage fields and status by admins only.
 * - Delete: nobody. Requests are declined, never deleted, so the history stays visible.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.sub.eq(item.requesterSub).and(item.status.eq('new')),
  include: ['title', 'description', 'team', 'requesterSub', 'requesterName', 'value', 'urgency', 'status', 'createdAt', 'updatedAt'],
})
@role('authenticated', 'update', {
  exclude: ['requesterSub', 'requesterName', 'createdAt'],
})
export class DataRequest {
  @uuid() id!: string;
  @text({ min: 5, max: 120 }) title!: string;
  @text({ min: 1, max: 2000 }) description!: string;
  @text({ min: 1, max: 80 }) team!: string;
  @text({ min: 1, max: 255 }) requesterSub!: string;
  @text({ min: 1, max: 100 }) requesterName!: string;
  @int({ min: 1, max: 5 }) value!: number;
  @set('low', 'normal', 'high') urgency!: 'low' | 'normal' | 'high';
  @set({ enum: ['S', 'M', 'L', 'XL'], optional: true }) effort?: 'S' | 'M' | 'L' | 'XL';
  @set('new', 'triaged', 'planned', 'in_progress', 'delivered', 'declined')
  status!: 'new' | 'triaged' | 'planned' | 'in_progress' | 'delivered' | 'declined';
  @text({ max: 100, optional: true }) assigneeName?: string;
  @date({ optional: true }) targetDate?: Date;
  @text({ max: 300, optional: true }) declineReason?: string;
  @uuid({ optional: true }) duplicateOfId?: string;
  @date() createdAt!: Date;
  @date() updatedAt!: Date;
}
