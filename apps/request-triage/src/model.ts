/**
 * App data types and runtime entity definitions. Keep these in step with rayfin/data/*.ts:
 * every field listed here must exist on the entity class with the matching decorator.
 * Dates are ISO strings in the app; optional fields are `| null`.
 */
import type { EntityDefs } from '@x10/shared/data';
import { AppMarkerDef, PersonDef, type AppMarker, type Person } from '@x10/shared/identity';

/** The same numbers as the @text / @int decorators on the entities. */
export const limits = {
  title: { min: 5, max: 120 },
  description: { min: 1, max: 2000 },
  team: { min: 1, max: 80 },
  assigneeName: { max: 100 },
  declineReason: { min: 1, max: 300 },
  comment: { min: 1, max: 600 },
  note: { max: 300 },
  value: { min: 1, max: 5 },
} as const;

export const STATUSES = ['new', 'triaged', 'planned', 'in_progress', 'delivered', 'declined'] as const;
export type Status = (typeof STATUSES)[number];

export const URGENCIES = ['low', 'normal', 'high'] as const;
export type Urgency = (typeof URGENCIES)[number];

export const EFFORTS = ['S', 'M', 'L', 'XL'] as const;
export type Effort = (typeof EFFORTS)[number];

export interface DataRequest {
  id: string;
  title: string;
  description: string;
  team: string;
  requesterSub: string;
  requesterName: string;
  value: number;
  urgency: Urgency;
  effort: Effort | null;
  status: Status;
  assigneeName: string | null;
  targetDate: string | null;
  declineReason: string | null;
  duplicateOfId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Supporter {
  id: string;
  requestId: string;
  voterSub: string;
  createdAt: string;
}

export interface RequestComment {
  id: string;
  requestId: string;
  authorSub: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface StatusChange {
  id: string;
  requestId: string;
  fromStatus: Status | null;
  toStatus: Status;
  bySub: string;
  byName: string;
  note: string | null;
  at: string;
}

export type Schema = {
  Person: Person;
  AppMarker: AppMarker;
  DataRequest: DataRequest;
  Supporter: Supporter;
  RequestComment: RequestComment;
  StatusChange: StatusChange;
};

export const defs: EntityDefs<Schema> = {
  Person: PersonDef,
  AppMarker: AppMarkerDef,
  DataRequest: {
    name: 'DataRequest',
    fields: {
      id: 'uuid',
      title: 'text',
      description: 'text',
      team: 'text',
      requesterSub: 'text',
      requesterName: 'text',
      value: 'int',
      urgency: 'set',
      effort: 'set',
      status: 'set',
      assigneeName: 'text',
      targetDate: 'date',
      declineReason: 'text',
      duplicateOfId: 'uuid',
      createdAt: 'date',
      updatedAt: 'date',
    },
  },
  Supporter: {
    name: 'Supporter',
    fields: { id: 'uuid', requestId: 'uuid', voterSub: 'text', createdAt: 'date' },
  },
  RequestComment: {
    name: 'RequestComment',
    fields: { id: 'uuid', requestId: 'uuid', authorSub: 'text', authorName: 'text', body: 'text', createdAt: 'date' },
  },
  StatusChange: {
    name: 'StatusChange',
    fields: {
      id: 'uuid',
      requestId: 'uuid',
      fromStatus: 'set',
      toStatus: 'set',
      bySub: 'text',
      byName: 'text',
      note: 'text',
      at: 'date',
    },
  },
};
