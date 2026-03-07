import { useEffect, useState } from 'react';
import { QueryKey, QueryOptions, QueryResult } from '@sitecore-marketplace-sdk/client';
import { useMarketplaceClient } from '@/components/providers/marketplace';

export function useClientQuery<K extends QueryKey>(
    key: K,
    queryOptions?: QueryOptions<K>,
    runQuery: boolean = true) {
    const client = useMarketplaceClient();
    const [result, setResult] = useState<QueryResult<K>['data']>();
    useEffect(() => {
        client && runQuery && client.query(key, queryOptions)
            .then((res) => {
                setResult(res.data);
            })
            .catch((error) => {
                setResult(error);
            });

    }, [client, key, runQuery, queryOptions]);

    return result;
};

export function useSubscribeQuery<K extends QueryKey>(key: K) {
  const client = useMarketplaceClient();
  const [result, setResult] = useState<QueryResult<K>['data']>();
  useEffect(() => {
    if (client) {
      client
        .query(key, {
          subscribe: true,
          onSuccess: (res) => {
            setResult(res);
          },
        })
        .then((res) => {
          setResult(res.data);
        })
        .catch((error) => {
          setResult(error);
        });
    }
  }, [client, key]);

  return result;
}

export const usePagesContext = () => useSubscribeQuery('pages.context');
