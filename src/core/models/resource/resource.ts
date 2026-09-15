export type ResourceDetails = {
  id: string;
  uri: string;
  scheme: string;
  indexed_at: number;
};

export type ResourceTag = {
  label: string;
  taggers: string[];
  taggers_count: number;
  relationship: boolean;
};

export type Resource = {
  details: ResourceDetails;
  tags: ResourceTag[];
  taggers_count?: number;
};

export type ResourceTagsResponse = {
  resource: ResourceDetails;
  tags: ResourceTag[];
};

export type ResourcePage = {
  resources: Resource[];
  nextSkip: number | null;
};

export type ResourceStreamParams = {
  app?: string;
  tags?: string;
  limit?: number;
  limit_tags?: number;
  limit_taggers?: number;
  skip?: number;
  sorting?: 'timeline' | 'taggers_count';
  start?: number;
  end?: number;
};

export type ResourcesByTagParams = {
  tag: string;
  limit?: number;
  limit_tags?: number;
  limit_taggers?: number;
  skip?: number;
  sorting?: 'timeline' | 'taggers_count';
};

export type ResourceByIdParams = {
  id: string;
  limit_tags?: number;
  limit_taggers?: number;
  skip_tags?: number;
};

export type ResourceByUriParams = {
  uri: string;
  limit_tags?: number;
  limit_taggers?: number;
  skip_tags?: number;
};
