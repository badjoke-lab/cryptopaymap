import { describe, expect, it } from 'vitest';
import {
  authorizeExportRelease,
  ExportReleaseAuthorizationError,
  readExportReleaseAuthorizationPolicy,
} from '../src/admin/export-release/authorization';

const identity = {
  actorId: 'cloudflare-access:export-reviewer',
  actorType: 'human' as const,
  subject: 'export-reviewer',
  email: 'reviewer@example.test',
};
const requestId = '10000000-0000-4000-8000-000000000001';

describe('export release authorization', () => {
  it('authorizes an allowlisted verified identity', () => {
    const policy = readExportReleaseAuthorizationPolicy({
      CPM_ADMIN_EXPORT_RELEASE_ACTOR_IDS: JSON.stringify([identity.actorId]),
    });

    expect(authorizeExportRelease(identity, policy, requestId)).toEqual({
      requestId,
      actorId: identity.actorId,
      actorType: identity.actorType,
      capabilities: ['export:release'],
    });
  });

  it('fails closed when no actor policy is configured', () => {
    const policy = readExportReleaseAuthorizationPolicy({});
    expect(() => authorizeExportRelease(identity, policy, requestId)).toThrow(
      ExportReleaseAuthorizationError,
    );
  });

  it('rejects identities outside the export release allowlist', () => {
    const policy = readExportReleaseAuthorizationPolicy({
      CPM_ADMIN_EXPORT_RELEASE_ACTOR_IDS: JSON.stringify(['another-actor']),
    });
    expect(() => authorizeExportRelease(identity, policy, requestId)).toThrowError(
      expect.objectContaining({ code: 'not_authorized' }),
    );
  });

  it('requires an idempotency UUID', () => {
    const policy = readExportReleaseAuthorizationPolicy({
      CPM_ADMIN_EXPORT_RELEASE_ACTOR_IDS: JSON.stringify([identity.actorId]),
    });
    expect(() => authorizeExportRelease(identity, policy, null)).toThrowError(
      expect.objectContaining({ code: 'invalid_request_id' }),
    );
  });
});
