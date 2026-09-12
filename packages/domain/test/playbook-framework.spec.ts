import { ErrorCodes } from '@crosspilot/shared';
import {
  InMemoryPlaybookStore,
  PlaybookEngine,
  PlaybookError,
  validateAgainstSchema,
} from '../src/playbook/index.js';
import type { CreatePlaybookInput, PlaybookJsonSchema } from '@crosspilot/shared';

const inputSchema: PlaybookJsonSchema = {
  type: 'object',
  properties: {
    keyword: { type: 'string' },
    category: { type: 'string' },
  },
  required: ['keyword'],
};

const outputSchema: PlaybookJsonSchema = {
  type: 'object',
  properties: {
    decision: { type: 'string' },
    score: { type: 'number' },
  },
  required: ['decision'],
};

function validCreate(overrides: Partial<CreatePlaybookInput> = {}): CreatePlaybookInput {
  return {
    name: 'amazon-product-research',
    version: '1.0.0',
    inputSchema,
    outputSchema,
    ...overrides,
  };
}

function engine() {
  return new PlaybookEngine(new InMemoryPlaybookStore());
}

describe('Playbook Framework (V9.2 Phase 1)', () => {
  const ws = 'ws-a';

  it('creates a playbook as REGISTERED', async () => {
    const pb = await engine().createPlaybook(ws, validCreate());
    expect(pb.id).toBeTruthy();
    expect(pb.status).toBe('REGISTERED');
    expect(pb.version).toBe('1.0.0');
    expect(pb.definition).toEqual({});
  });

  it('persists ACTIVE when status is provided', async () => {
    const pb = await engine().createPlaybook(ws, validCreate({ status: 'ACTIVE' }));
    expect(pb.status).toBe('ACTIVE');
  });

  it('rejects version that is not MAJOR.MINOR.PATCH', async () => {
    await expect(engine().createPlaybook(ws, validCreate({ version: 'v1' }))).rejects.toMatchObject({
      code: ErrorCodes.PLAYBOOK_VERSION_INVALID,
    });
  });

  it('rejects duplicate workspace+name+version', async () => {
    const eng = engine();
    await eng.createPlaybook(ws, validCreate());
    await expect(eng.createPlaybook(ws, validCreate())).rejects.toMatchObject({
      code: ErrorCodes.PLAYBOOK_VERSION_CONFLICT,
    });
  });

  it('rejects input schema that is not an object schema', async () => {
    await expect(
      engine().createPlaybook(ws, validCreate({ inputSchema: { type: 'string' } as any })),
    ).rejects.toMatchObject({ code: ErrorCodes.PLAYBOOK_SCHEMA_INVALID });
  });

  it('rejects illegal output schema', async () => {
    await expect(
      engine().createPlaybook(ws, {
        ...validCreate(),
        outputSchema: { type: 'object', properties: {}, required: ['missing'] },
      }),
    ).rejects.toMatchObject({ code: ErrorCodes.PLAYBOOK_SCHEMA_INVALID });
  });

  it('validateAgainstSchema fails when required input field is missing', () => {
    const result = validateAgainstSchema({ category: 'home' }, inputSchema);
    expect(result.ok).toBe(false);
  });

  it('validateAgainstSchema fails when required output field is missing', () => {
    const result = validateAgainstSchema({ score: 1 }, outputSchema);
    expect(result.ok).toBe(false);
  });

  it('validateAgainstSchema fails on wrong JSON type', () => {
    const result = validateAgainstSchema({ keyword: 12 }, inputSchema);
    expect(result.ok).toBe(false);
  });

  it('validateAgainstSchema accepts valid input and output payloads', () => {
    expect(validateAgainstSchema({ keyword: 'mug' }, inputSchema).ok).toBe(true);
    expect(validateAgainstSchema({ decision: 'ENTER' }, outputSchema).ok).toBe(true);
  });

  it('startRun returns an independent runId different from playbook id and run pk', async () => {
    const eng = engine();
    const pb = await eng.createPlaybook(ws, validCreate());
    const started = await eng.startRun(ws, pb.id, { keyword: 'mug' }, 'user-1');
    expect(started.runId).toBeTruthy();
    expect(started.runId).not.toBe(pb.id);
    expect(started.runId).not.toBe(started.run.id);
    expect(started.status).toBe('CREATED');
    expect(started.run.status).toBe('CREATED');
    expect(started.run.output).toBeNull();
    expect(started.run.createdBy).toBe('user-1');
  });

  it('startRun does not mutate Playbook status', async () => {
    const eng = engine();
    const pb = await eng.createPlaybook(ws, validCreate({ status: 'ACTIVE' }));
    await eng.startRun(ws, pb.id, { keyword: 'mug' });
    const loaded = await eng.getPlaybook(ws, pb.id);
    expect(loaded.status).toBe('ACTIVE');
  });

  it('startRun rejects DISABLED playbooks', async () => {
    const eng = engine();
    const pb = await eng.createPlaybook(ws, validCreate({ status: 'DISABLED' }));
    await expect(eng.startRun(ws, pb.id, { keyword: 'mug' })).rejects.toMatchObject({
      code: ErrorCodes.PLAYBOOK_DISABLED,
    });
  });

  it('startRun rejects invalid input and does not create a run', async () => {
    const store = new InMemoryPlaybookStore();
    const eng = new PlaybookEngine(store);
    const pb = await eng.createPlaybook(ws, validCreate());
    await expect(eng.startRun(ws, pb.id, { category: 'home' })).rejects.toMatchObject({
      code: ErrorCodes.PLAYBOOK_INPUT_INVALID,
    });
    expect(store.listAllRuns()).toHaveLength(0);
    const listed = await eng.listPlaybooks(ws);
    expect(listed).toHaveLength(1);
  });

  it('does not leak playbooks across workspaces', async () => {
    const eng = engine();
    const pb = await eng.createPlaybook(ws, validCreate());
    await expect(eng.getPlaybook('ws-b', pb.id)).rejects.toMatchObject({
      code: ErrorCodes.PLAYBOOK_NOT_FOUND,
    });
  });

  it('startRun leaves run CREATED with null output (no workflow side effects)', async () => {
    const eng = engine();
    const pb = await eng.createPlaybook(ws, validCreate());
    const started = await eng.startRun(ws, pb.id, { keyword: 'mug', category: 'home' });
    const run = await eng.getRun(ws, started.runId);
    expect(run.status).toBe('CREATED');
    expect(run.output).toBeNull();
    expect(run.input).toEqual({ keyword: 'mug', category: 'home' });
  });

  it('PlaybookError carries a stable code', () => {
    const err = new PlaybookError(ErrorCodes.PLAYBOOK_NOT_FOUND, 'missing');
    expect(err.code).toBe(ErrorCodes.PLAYBOOK_NOT_FOUND);
    expect(err).toBeInstanceOf(Error);
  });
});
