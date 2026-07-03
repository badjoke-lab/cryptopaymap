import { describe, expect, it } from 'vitest';
import {
  authorizeExportPublication,
  readExportPublicationAuthorizationPolicy,
} from '../src/admin/export-release/publication-authorization';

const identity = {
  actorId: 'cloudflare-access:release-activator',
  actorType: 'human' as const,
  subject: 'release-activator',
  email: 'activator@example.test',
};
const requestId = '10000000-0000-4000-8000-000000000001';

describe('export activation authorization boundary', () => {
  it('grants the isolated capability to an allowlisted identity', () => {
    const policy = readExportPublicationAuthorizationPolicy({
      CPM_ADMIN_EXPORT_PUBLISH_ACTOR_IDS: JSON.stringify([identity.actorId]),
    });
    expect(authorizeExportPublication(identity, policy, requestId)).toEqual({
      requestId,
      actorId: identity.actorId,
      actorType: identity.actorType,
      capabilities: ['export:publish'],
    });
  });

  it('fails closed for missing policy, unauthorized identity, or request ID', () => {
    const missing = readExportPublicationAuthorizationPolicy({});
    expect(() => authorizeExportPublication(identity, missing, requestId)).toThrow();

    const denied = readExportPublicationAuthorizationPolicy({
      CPM_ADMIN_EXPORT_PUBLISH_ACTOR_IDS: JSON.stringify(['another-actor']),
    });
    expect(() => authorizeExportPublication(identity, denied, requestId)).toThrowError(
      expect.objectContaining({ code: 'not_authorized' }),
    );

    const allowed = readExportPublicationAuthorizationPolicy({
      CPM_ADMIN_EXPORT_PUBLISH_ACTOR_IDS: JSON.stringify([identity.actorId]),
    });
    expect(() => authorizeExportPublication(identity, allowed, null)).toThrowError(
      expect.objectContaining({ code: 'invalid_request_id' }),
    );
  });
});
