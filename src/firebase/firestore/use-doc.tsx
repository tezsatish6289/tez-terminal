'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DocumentReference,
  DocumentData,
  FirestoreError,
  getDoc,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

type WithId<T> = T & { id: string };

/**
 * Interface for the return value of the useDoc hook.
 *
 * NOTE: this hook performs a one-shot `getDoc` on mount (and whenever the
 * memoized ref changes). It does NOT subscribe to real-time updates —
 * call `refetch()` from a refresh button or on focus to refresh the data.
 *
 * Real-time `onSnapshot` was removed to cut Firestore read costs: every
 * listener × every cron write to a watched doc was being billed. Clients
 * now refresh pages (or call `refetch`) to see new data.
 */
export interface UseDocResult<T> {
  data: WithId<T> | null;
  isLoading: boolean;
  error: FirestoreError | Error | null;
  refetch: () => Promise<void>;
}

export function useDoc<T = any>(
  memoizedDocRef: DocumentReference<DocumentData> | null | undefined,
): UseDocResult<T> {
  type StateDataType = WithId<T> | null;

  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  // Keep latest ref for refetch() so caller doesn't need to re-create it.
  const refRef = useRef(memoizedDocRef);
  refRef.current = memoizedDocRef;

  const fetchOnce = useCallback(async () => {
    const ref = refRef.current;
    if (!ref) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setData({ ...(snap.data() as T), id: snap.id });
      } else {
        setData(null);
      }
    } catch (e) {
      const fe = e as FirestoreError;
      if (fe?.code === 'permission-denied') {
        const contextualError = new FirestorePermissionError({
          operation: 'get',
          path: ref.path,
        });
        setError(contextualError);
        errorEmitter.emit('permission-error', contextualError);
      } else {
        setError(fe ?? (e as Error));
        // eslint-disable-next-line no-console
        console.error('Firestore useDoc error:', e);
      }
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOnce();
  }, [memoizedDocRef, fetchOnce]);

  return { data, isLoading, error, refetch: fetchOnce };
}
