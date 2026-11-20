import { AppMarker } from './AppMarker.js';
import { DataRequest } from './DataRequest.js';
import { Person } from './Person.js';
import { RequestComment } from './RequestComment.js';
import { StatusChange } from './StatusChange.js';
import { Supporter } from './Supporter.js';

export type AppSchema = {
  Person: Person;
  AppMarker: AppMarker;
  DataRequest: DataRequest;
  Supporter: Supporter;
  RequestComment: RequestComment;
  StatusChange: StatusChange;
};

export const schema = [Person, AppMarker, DataRequest, Supporter, RequestComment, StatusChange];
