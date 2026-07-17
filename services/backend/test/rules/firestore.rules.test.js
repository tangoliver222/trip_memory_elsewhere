import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

test('Firestore rules isolate owner data and block client-derived writes', { skip: !enabled }, async (t) => {
  const rules = await readFile(
    new URL('../../../../firebase/firestore.rules', import.meta.url),
    'utf8',
  );
  const environment = await initializeTestEnvironment({
    projectId: 'demo-elsewhere',
    firestore: { rules },
  });

  try {
    const path = 'users/user_alpha/fragments/frag_12345678';
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), path), { ownerId: 'user_alpha' });
    });

    await t.test('owner can read an owned fragment', async () => {
      const database = environment.authenticatedContext('user_alpha').firestore();
      const snapshot = await assertSucceeds(getDoc(doc(database, path)));
      assert.equal(snapshot.data().ownerId, 'user_alpha');
    });

    await t.test('another user cannot read the fragment', async () => {
      const database = environment.authenticatedContext('user_beta').firestore();
      await assertFails(getDoc(doc(database, path)));
    });

    await t.test('the owner cannot write server-derived fragments', async () => {
      const database = environment.authenticatedContext('user_alpha').firestore();
      await assertFails(setDoc(doc(database, `${path}_new`), { ownerId: 'user_alpha' }));
    });

    await t.test('the owner cannot forge ImportBatch manifests or derived state', async () => {
      const batchPath = 'users/user_alpha/importBatches/batch_12345678';
      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), batchPath), {
          ownerId: 'user_alpha',
          status: 'open',
          uploadStatus: 'pending',
          counters: { saved: 0 },
          uploads: {},
        });
      });
      const database = environment.authenticatedContext('user_alpha').firestore();

      await assertFails(setDoc(doc(database, `${batchPath}_new`), {
        ownerId: 'user_alpha',
        uploads: { frag_forged01: { state: 'pending' } },
      }));
      await assertFails(updateDoc(doc(database, batchPath), {
        status: 'processing',
        uploadStatus: 'complete',
        'counters.saved': 1,
      }));
      await assertFails(deleteDoc(doc(database, batchPath)));
    });

    await t.test('only the owner can read DuplicateCandidate documents', async () => {
      const candidatePath = 'users/user_alpha/duplicateCandidates/candidate_12345678';
      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), candidatePath), {
          ownerId: 'user_alpha',
          kind: 'exact',
        });
      });
      const contexts = [
        ['owner', environment.authenticatedContext('user_alpha').firestore()],
        ['other', environment.authenticatedContext('user_beta').firestore()],
        ['anonymous', environment.unauthenticatedContext().firestore()],
      ];

      for (const [label, database] of contexts) {
        if (label === 'owner') {
          await assertSucceeds(getDoc(doc(database, candidatePath)));
        } else {
          await assertFails(getDoc(doc(database, candidatePath)));
        }
      }
    });

    await t.test('every client is denied each DuplicateCandidate mutation', async () => {
      const candidatePath = 'users/user_alpha/duplicateCandidates/candidate_write01';
      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), candidatePath), { ownerId: 'user_alpha' });
      });
      const contexts = [
        ['owner', environment.authenticatedContext('user_alpha').firestore()],
        ['other', environment.authenticatedContext('user_beta').firestore()],
        ['anonymous', environment.unauthenticatedContext().firestore()],
      ];

      for (const [label, database] of contexts) {
        await assertFails(setDoc(
          doc(database, `users/user_alpha/duplicateCandidates/candidate_create_${label}01`),
          { ownerId: 'user_alpha' },
        ));
        await assertFails(updateDoc(doc(database, candidatePath), { status: 'confirmed' }));
        await assertFails(deleteDoc(doc(database, candidatePath)));
      }
    });

    await t.test('ProcessingTask and ContentHash stay private from every client', async () => {
      const internalPaths = [
        'users/user_alpha/processingTasks/task_12345678',
        `users/user_alpha/contentHashes/${'a'.repeat(64)}`,
      ];
      await environment.withSecurityRulesDisabled(async (context) => {
        for (const internalPath of internalPaths) {
          await setDoc(doc(context.firestore(), internalPath), { ownerId: 'user_alpha' });
        }
      });

      const contexts = [
        ['owner', environment.authenticatedContext('user_alpha').firestore()],
        ['other', environment.authenticatedContext('user_beta').firestore()],
        ['anonymous', environment.unauthenticatedContext().firestore()],
      ];
      for (const [label, database] of contexts) {
        for (const internalPath of internalPaths) {
          await assertFails(getDoc(doc(database, internalPath)));
          await assertFails(setDoc(doc(database, `${internalPath}_${label}_new`), {
            ownerId: 'user_alpha',
          }));
          await assertFails(updateDoc(doc(database, internalPath), { state: 'forged' }));
          await assertFails(deleteDoc(doc(database, internalPath)));
        }
      }
    });

    await t.test('all authoritative routing state stays private from every client', async () => {
      const internalPaths = [
        'users/user_alpha/routePlans/route_plan_12345678',
        'users/user_alpha/routingHeads/routing_head_12345678',
        'users/user_alpha/routingCohorts/routing_cohort_12345678',
        'users/user_alpha/budgetLedgers/budget_ledger_12345678',
        'users/user_alpha/budgetReservations/budget_reservation_12345678',
        'users/user_alpha/capabilityExecutions/capability_execution_12345678',
        'users/user_alpha/escalationRequests/escalation_request_12345678',
      ];
      await environment.withSecurityRulesDisabled(async (context) => {
        for (const internalPath of internalPaths) {
          await setDoc(doc(context.firestore(), internalPath), { ownerId: 'user_alpha' });
        }
      });

      const contexts = [
        ['owner', environment.authenticatedContext('user_alpha').firestore()],
        ['other', environment.authenticatedContext('user_beta').firestore()],
        ['anonymous', environment.unauthenticatedContext().firestore()],
      ];
      for (const [label, database] of contexts) {
        for (const internalPath of internalPaths) {
          await assertFails(getDoc(doc(database, internalPath)));
          await assertFails(setDoc(doc(database, `${internalPath}_${label}_new`), {
            ownerId: 'user_alpha',
          }));
          await assertFails(updateDoc(doc(database, internalPath), { state: 'forged' }));
          await assertFails(deleteDoc(doc(database, internalPath)));
        }
      }
    });

    await t.test('owner reads retain Fragment and ImportBatch routing summary visibility', async () => {
      const batchPath = 'users/user_alpha/importBatches/batch_routing01';
      const routingSummary = {
        routerName: 'fragment-routing',
        routerVersion: 'v1',
        eligible: 1,
        drafting: 0,
        approved: 1,
        executing: 0,
        completed: 0,
        superseded: 0,
        rejected: 0,
      };
      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), batchPath), {
          ownerId: 'user_alpha',
          routingSummary,
        });
      });
      const database = environment.authenticatedContext('user_alpha').firestore();

      assert.deepEqual((await assertSucceeds(getDoc(doc(database, batchPath)))).data().routingSummary,
        routingSummary);
      assert.equal((await assertSucceeds(getDoc(doc(database, path)))).data().ownerId, 'user_alpha');
    });
  } finally {
    await environment.cleanup();
  }
});
