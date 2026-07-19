'use client'

import type { ExperimentRunInsert, MetricsInsert, SampleInsert } from '@/app/actions/experiment'

export interface PendingExperimentRun {
  run: ExperimentRunInsert
  metrics: MetricsInsert
  samples: SampleInsert[]
  queuedAt: number
  attempts: number
  lastError?: string
}

const DB_NAME = 'scara-experiment-outbox'
const STORE_NAME = 'pending-runs'
const DB_VERSION = 1

function openOutbox(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser.'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('Failed to open experiment outbox.'))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'run.id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function transact<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openOutbox().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const store = tx.objectStore(STORE_NAME)
    const request = operation(store)
    let result: T
    request.onsuccess = () => { result = request.result }
    request.onerror = () => reject(request.error ?? new Error('Experiment outbox request failed.'))
    tx.oncomplete = () => {
      db.close()
      resolve(result)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error ?? new Error('Experiment outbox transaction failed.'))
    }
  }))
}

export function putPendingExperiment(item: PendingExperimentRun): Promise<void> {
  return transact<IDBValidKey>('readwrite', store => store.put(item)).then(() => undefined)
}

export function listPendingExperiments(): Promise<PendingExperimentRun[]> {
  return transact<PendingExperimentRun[]>('readonly', store => store.getAll())
    .then(items => items.sort((a, b) => a.queuedAt - b.queuedAt))
}

export function removePendingExperiment(runId: string): Promise<void> {
  return transact<undefined>('readwrite', store => store.delete(runId)).then(() => undefined)
}
