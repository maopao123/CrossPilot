export type PlaybookStatus = 'REGISTERED' | 'ACTIVE' | 'DISABLED';

export type PlaybookRunStatus = 'CREATED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type PlaybookJsonSchemaType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface PlaybookJsonSchemaProperty {
  type: PlaybookJsonSchemaType;
}

export interface PlaybookJsonSchema {
  type: 'object';
  properties: Record<string, PlaybookJsonSchemaProperty>;
  required?: string[];
}

export interface CreatePlaybookInput {
  name: string;
  version: string;
  status?: PlaybookStatus;
  inputSchema: PlaybookJsonSchema;
  outputSchema: PlaybookJsonSchema;
  definition?: Record<string, unknown>;
}

export interface StartPlaybookRunInput {
  input: Record<string, unknown>;
}

export interface PlaybookRecord {
  id: string;
  workspaceId: string;
  name: string;
  version: string;
  status: PlaybookStatus;
  inputSchema: PlaybookJsonSchema;
  outputSchema: PlaybookJsonSchema;
  definition: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PlaybookRunRecord {
  id: string;
  workspaceId: string;
  playbookId: string;
  runId: string;
  status: PlaybookRunStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StartPlaybookRunResult {
  runId: string;
  playbookId: string;
  status: 'CREATED';
  run: PlaybookRunRecord;
}
