'use client';

import React, {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ApplicationContext,
  ClientSDK,
} from '@sitecore-marketplace-sdk/client';
import { XMC } from '@sitecore-marketplace-sdk/xmc';
import { Toaster, toast } from 'sonner';
import { Loader } from '@/components/ai-elements/loader';

interface ClientSDKProviderProps {
  children: ReactNode;
}

const ClientSDKContext = createContext<ClientSDK | null>(null);
const AppContextContext = createContext<ApplicationContext | null>(null);

export const MarketplaceProvider: React.FC<ClientSDKProviderProps> = ({
  children,
}) => {
  const [client, setClient] = useState<ClientSDK | null>(null);
  const [appContext, setAppContext] = useState<ApplicationContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (client) {
      client.query('application.context').then((res) => {
        if (res && res.data) {
          setAppContext(res.data);
          console.log('appContext', res.data);
        }
      });
    }
  }, [client]);

  useEffect(() => {
    const init = async () => {
      const config = {
        target: window.parent,
        modules: [XMC],
      };
      try {
        setLoading(true);
        const client = await ClientSDK.init(config);
        setClient(client);
      } catch (error) {
        console.error('Error initializing client SDK', error);
        setError('Error initializing client SDK');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  useEffect(() => {
    toast.error(error, { duration: Infinity, position: 'top-left' });
  }, [error]);

  if (loading) {
    return (
      <div className='flex'>
        <div className='relative mx-auto h-[100px]'>
          <Loader className='absolute bottom-0 left-0' />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Toaster />
      </div>
    );
  }

  if (!client) {
    return null;
  }

  if (!appContext) {
    return null;
  }

  return (
    <ClientSDKContext.Provider value={client}>
      <AppContextContext.Provider value={appContext}>
        {children}
      </AppContextContext.Provider>
    </ClientSDKContext.Provider>
  );
};

export const useMarketplaceClient = () => {
  const context = useContext(ClientSDKContext);
  if (!context) {
    throw new Error(
      'useMarketplaceClient must be used within a ClientSDKProvider'
    );
  }
  return context;
};

export const useAppContext = () => {
  const context = useContext(AppContextContext);
  if (!context) {
    throw new Error('useAppContext must be used within a ClientSDKProvider');
  }
  console.log('useAppContext', context);
  return context;
};

export const usePreviewContextId = () => {
    const appContext = useAppContext();
    return useMemo(() => appContext?.resourceAccess?.[0]?.context.preview, [appContext]);
}
