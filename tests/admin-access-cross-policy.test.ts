import { describe, expect, it } from 'vitest';
import { parseVerifiedAdminAccessIdentity } from '../src/admin/access/identity';
import {
  authorizeAuditHistoryRead,
  readAuditHistoryAuthorizationPolicy,
} from '../src/admin/audit-history/authorization';
import {
  authorizeCandidateDuplicateResolve,
  readCandidateDuplicateAuthorizationPolicy,
} from '../src/admin/candidates/duplicate-authorization';
import {
  authorizeCandidateQueueRead,
  readCandidateQueueAuthorizationPolicy,
} from '../src/admin/candidates/authorization';
import {
  authorizeAdminDashboardRead,
  readAdminDashboardAuthorizationPolicy,
} from '../src/admin/dashboard/authorization';
import {
  authorizeEvidenceReview,
  readEvidenceReviewAuthorizationPolicy,
} from '../src/admin/evidence-review/authorization';
import { authorizeEvidenceReviewRead } from '../src/admin/evidence-review/read-authorization';
import {
  authorizeExportRelease,
  readExportReleaseAuthorizationPolicy,
} from '../src/admin/export-release/authorization';
import {
  authorizeExportPublication,
  readExportPublicationAuthorizationPolicy,
} from '../src/admin/export-release/publication-authorization';
import {
  authorizeLocationCorrection,
  authorizeLocationCorrectionRead,
  readLocationCorrectionAuthorizationPolicy,
} from '../src/admin/location-correction/authorization';
import {
  authorizeMediaReview,
  readMediaReviewAuthorizationPolicy,
} from '../src/admin/media-review/authorization';
import { authorizeMediaReviewRead } from '../src/admin/media-review/read-authorization';
import {
  authorizeCandidatePromotion,
  readCandidatePromotionAuthorizationPolicy,
} from '../src/admin/promotion/authorization';
import {
  authorizeReconfirmationExpiration,
  authorizeReconfirmationRead,
  readReconfirmationAuthorizationPolicy,
} from '../src/admin/reconfirmation/authorization';

const requestId = '10000000-0000-4000-8000-000000000001';
const subject = 'reviewer-subject';
const actorId = `cloudflare-access:${subject}`;
const subjectList = JSON.stringify([subject]);
const actorIdList = JSON.stringify([actorId]);

const identity = parseVerifiedAdminAccessIdentity({
  sub: subject,
  email: 'reviewer@example.test',
});

describe('Admin Access cross-policy identifier contract', () => {
  it('derives one stable subject and normalized actor ID from the verified Access payload', () => {
    expect(identity).toEqual({
      actorId,
      actorType: 'human',
      subject,
      email: 'reviewer@example.test',
    });
  });

  it('authorizes one operator across every subject-based boundary with the raw Access subject', () => {
    expect(
      authorizeAdminDashboardRead(
        identity,
        readAdminDashboardAuthorizationPolicy({
          CPM_ADMIN_DASHBOARD_SUBJECTS: subjectList,
        }),
      ),
    ).toMatchObject({ actorId, actorType: 'human', capabilities: ['dashboard:read'] });

    expect(
      authorizeCandidateQueueRead(
        identity,
        readCandidateQueueAuthorizationPolicy({
          CPM_ADMIN_CANDIDATE_SUBJECTS: subjectList,
        }),
      ),
    ).toMatchObject({ actorId, capabilities: ['candidate:read'] });

    expect(
      authorizeCandidateDuplicateResolve(
        identity,
        readCandidateDuplicateAuthorizationPolicy({
          CPM_ADMIN_CANDIDATE_RESOLVE_SUBJECTS: subjectList,
        }),
        requestId,
      ),
    ).toMatchObject({ actorId, requestId, capabilities: ['candidate:resolve'] });

    expect(
      authorizeCandidatePromotion(
        identity,
        readCandidatePromotionAuthorizationPolicy({
          CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS: subjectList,
        }),
        requestId,
      ),
    ).toMatchObject({ actorId, requestId, capabilities: ['candidate:promote'] });

    const locationPolicy = readLocationCorrectionAuthorizationPolicy({
      CPM_ADMIN_LOCATION_CORRECT_SUBJECTS: subjectList,
    });
    expect(authorizeLocationCorrectionRead(identity, locationPolicy)).toMatchObject({
      actorId,
      capabilities: ['location:correct'],
    });
    expect(authorizeLocationCorrection(identity, locationPolicy, requestId)).toMatchObject({
      actorId,
      requestId,
      capabilities: ['location:correct'],
    });

    const evidencePolicy = readEvidenceReviewAuthorizationPolicy({
      CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS: subjectList,
    });
    expect(authorizeEvidenceReviewRead(identity, evidencePolicy)).toMatchObject({
      actorId,
      capabilities: ['evidence:review'],
    });
    expect(authorizeEvidenceReview(identity, evidencePolicy, requestId)).toMatchObject({
      actorId,
      requestId,
      capabilities: ['evidence:review'],
    });

    const reconfirmationPolicy = readReconfirmationAuthorizationPolicy({
      CPM_ADMIN_RECONFIRMATION_SUBJECTS: subjectList,
    });
    expect(authorizeReconfirmationRead(identity, reconfirmationPolicy)).toMatchObject({
      actorId,
      actorType: 'human',
      capabilities: ['claim:recheck'],
    });
    expect(
      authorizeReconfirmationExpiration(identity, reconfirmationPolicy, requestId),
    ).toMatchObject({
      actorId,
      actorType: 'system',
      requestId,
      capabilities: ['claim:expire'],
    });
  });

  it('authorizes one operator across every actor-ID-based boundary with the normalized actor ID', () => {
    const mediaPolicy = readMediaReviewAuthorizationPolicy({
      CPM_ADMIN_MEDIA_REVIEW_ACTOR_IDS: actorIdList,
    });
    expect(authorizeMediaReviewRead(identity, mediaPolicy)).toMatchObject({
      actorId,
      actorType: 'human',
      capabilities: ['media:review'],
    });
    expect(authorizeMediaReview(identity, mediaPolicy, requestId)).toMatchObject({
      actorId,
      requestId,
      capabilities: ['media:review'],
    });

    expect(
      authorizeExportRelease(
        identity,
        readExportReleaseAuthorizationPolicy({
          CPM_ADMIN_EXPORT_RELEASE_ACTOR_IDS: actorIdList,
        }),
        requestId,
      ),
    ).toMatchObject({ actorId, requestId, capabilities: ['export:release'] });

    expect(
      authorizeExportPublication(
        identity,
        readExportPublicationAuthorizationPolicy({
          CPM_ADMIN_EXPORT_PUBLISH_ACTOR_IDS: actorIdList,
        }),
        requestId,
      ),
    ).toMatchObject({ actorId, requestId, capabilities: ['export:publish'] });

    expect(
      authorizeAuditHistoryRead(
        identity,
        readAuditHistoryAuthorizationPolicy({
          CPM_ADMIN_AUDIT_READ_ACTOR_IDS: actorIdList,
        }),
      ),
    ).toMatchObject({ actorId, capabilities: ['audit:read'] });
  });

  it('fails closed when subject and actor-ID representations are swapped', () => {
    expect(() =>
      authorizeCandidateQueueRead(
        identity,
        readCandidateQueueAuthorizationPolicy({
          CPM_ADMIN_CANDIDATE_SUBJECTS: actorIdList,
        }),
      ),
    ).toThrow();

    expect(() =>
      authorizeMediaReviewRead(
        identity,
        readMediaReviewAuthorizationPolicy({
          CPM_ADMIN_MEDIA_REVIEW_ACTOR_IDS: subjectList,
        }),
      ),
    ).toThrow();
  });
});
