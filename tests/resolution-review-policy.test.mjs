import assert from 'node:assert/strict';
import test from 'node:test';
import { canManageResolutionReview, requiresFieldResolutionReview } from '../api-lib/resolutionReviewPolicy.js';

test('review remains required unless an organization explicitly turns it off', () => {
  assert.equal(requiresFieldResolutionReview(undefined), true);
  assert.equal(requiresFieldResolutionReview(null), true);
  assert.equal(requiresFieldResolutionReview(true), true);
  assert.equal(requiresFieldResolutionReview(false), false);
});

test('only platform admins and organization owners can change the review policy', () => {
  const orgId = 'org-a';
  assert.equal(canManageResolutionReview({ isPlatformAdmin: true }, orgId), true);
  assert.equal(canManageResolutionReview({ managementMemberships: [{ org_id: orgId, role: 'owner' }] }, orgId), true);
  assert.equal(canManageResolutionReview({ managementMemberships: [{ org_id: orgId, role: 'manager' }] }, orgId), false);
  assert.equal(canManageResolutionReview({ managementMemberships: [{ org_id: 'org-b', role: 'owner' }] }, orgId), false);
});
