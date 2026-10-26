import assert from 'node:assert/strict'
import test from 'node:test'
import { assertExperimentOwnerAccess } from './experiment-access-policy.ts'

test('an account can update only its own existing experiment', () => {
  assert.doesNotThrow(() => assertExperimentOwnerAccess({ userId: 'alice', existing: true, ownerId: 'alice' }))
  assert.throws(() => assertExperimentOwnerAccess({ userId: 'bob', existing: true, ownerId: 'alice' }), /Forbidden/)
})

test('historical unassigned runs cannot be claimed through save or mutation requests', () => {
  for (const allowCreate of [false, true]) {
    assert.throws(() => assertExperimentOwnerAccess({ userId: 'alice', existing: true, ownerId: null, allowCreate }), /Forbidden/)
  }
})

test('only the save path can create a new run', () => {
  assert.doesNotThrow(() => assertExperimentOwnerAccess({ userId: 'alice', existing: false, ownerId: null, allowCreate: true }))
  assert.throws(() => assertExperimentOwnerAccess({ userId: 'alice', existing: false, ownerId: null }), /Run not found/)
})

test('a reserved or deleted run ID cannot be reused by another account', () => {
  assert.throws(() => assertExperimentOwnerAccess({ userId: 'bob', existing: false, ownerId: 'alice', allowCreate: true }), /Forbidden/)
  assert.doesNotThrow(() => assertExperimentOwnerAccess({ userId: 'alice', existing: false, ownerId: 'alice', allowCreate: true }))
})
