export type NexusResourceDetails = {
  id: string;
  uri: string;
  scheme: string;
  indexed_at: number;
};

export type NexusTagDetails = {
  label: string;
  taggers: string[];
  taggers_count: number;
  relationship: boolean;
};

export type NexusResource = {
  details: NexusResourceDetails;
  tags: NexusTagDetails[];
  taggers_count: number;
};

export type NexusResourceTagsResponse = {
  resource: NexusResourceDetails;
  tags: NexusTagDetails[];
};

export type TResourcesByTagParams = {
  tag: string;
  limit?: number;
  skip?: number;
  sorting?: 'timeline' | 'taggers_count';
};

export type TResourceByIdParams = {
  id: string;
  limit_tags?: number;
  skip_tags?: number;
};

export type TResourceByUriParams = {
  uri: string;
  limit_tags?: number;
  skip_tags?: number;
  limit_taggers?: number;
};
