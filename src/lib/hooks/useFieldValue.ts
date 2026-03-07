import { useEffect, useState } from 'react';
import { useMarketplaceClient } from '@/components/providers/marketplace';

export const useFieldValue = () => {
  const client = useMarketplaceClient();
  const [existingValue, setExistingValue] = useState<string | undefined>();
  useEffect(() => {
    async function fetchValue() {
      try {
        const res = await client.getValue();
        setExistingValue(res || '');
      } catch (error) {
        console.error('Failed to fetch existing value', error);
      }
    }
    fetchValue();
  }, [client]);
  return {
    existingValue,
    setExistingValue,
  };
};
