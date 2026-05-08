'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Query,
  DocumentData,
  FirestoreError,
  CollectionReference,
  getDocs,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export type WithId<T> = T & { id: string };

/**
 * Interface for the return value of the useCollection hook.
 *
 * NOTE: this hook performs a one-shot `getDocs` on mount (and whenever the
 * memoized query changes). It does NOT subscribe to real-time updates —
 * call `refetch()` from a refresh button or on focus to refresh the data.
 *
 * Real-time `onSnapshot` was removed to cut Firestore read costs: every
 * listener × every cron write to a watched doc was being billed. Clients
 * now refresh pages (or call `refetch`) to see new data.
 */
export interface UseCollectionResult<T> {
  data: WithId<T>[] | null;
  isLoading: boolean;
  error: FirestoreError | Error | null;
  refetch: () => Promise<void>;
}

/* Internal implementation of Query:
  https://github.com/firebase/firebase-js-sdk/blob/c5f08a9bc5da0d2b0207802c972d53724ccef055/packages/firestore/src/lite-api/reference.ts#L143
*/
export interface InternalQuery extends Query<DocumentData> {
  _query: {
    path: {
      canonicalString(): string;
      toString(): string;
    }
  }
}

export function useCollection<T = any>(
  memoizedTargetRefOrQuery:
    | ((CollectionReference<DocumentData> | Query<DocumentData>) & { __memo?: boolean })
    | null
    | undefined,
): UseCollectionResult<T> {
  type ResultItemType = WithId<T>;
  type StateDataType = ResultItemType[] | null;

  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  const queryRef = useRef(memoizedTargetRefOrQuery);
  queryRef.current = memoizedTargetRefOrQuery;

  const fetchOnce = useCallback(async () => {
    const target = queryRef.current;
    if (!target) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const snap = await getDocs(target);
      const results: ResultItemType[] = [];
      for (const d of snap.docs) {
        results.push({ ...(d.data() as T), id: d.id });
      }
      setData(results);
    } catch (e) {
      const fe = e as FirestoreError;
      if (fe?.code === 'permission-denied') {
        const path: string =
          target.type === 'collection'
            ? (target as CollectionReference).path
            : (target as unknown as InternalQuery)._query.path.canonicalString();
        const contextualError = new FirestorePermissionError({
          operation: 'list',
          path,
        });
        setError(contextualError);
        errorEmitter.emit('permission-error', contextualError);
      } else {
        setError(fe ?? (e as Error));
        // eslint-disable-next-line no-console
        console.error('Firestore useCollection error:', e);
      }
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOnce();
  }, [memoizedTargetRefOrQuery, fetchOnce]);

  if (memoizedTargetRefOrQuery && !memoizedTargetRefOrQuery.__memo) {
    throw new Error(
      memoizedTargetRefOrQuery + ' was not properly memoized using useMemoFirebase',
    );
  }

  return { data, isLoading, error, refetch: fetchOnce };
}
