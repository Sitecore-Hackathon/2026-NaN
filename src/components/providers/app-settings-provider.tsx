'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { AppSettingsModal } from '@/components/custom/api-key-modal';
import {
  useAppContext,
  useMarketplaceClient,
} from '@/components/providers/marketplace';
import { getApiKey, saveApiKey } from '@/lib/sitecore/storage/api-key-storage';

/**
 * Supported API key names
 */
export type ApiKey = 'vercel' | 'openai' | 'anthropic' | 'google' | 'exa';

export interface LocalSettings extends Record<string, unknown> {
  needsToolApproval: boolean;
  sitecoreToolsExecution: 'frontend' | 'backend';
}

interface AppSettingsContextType {
  keys: Record<ApiKey, string>;
  localSettings: LocalSettings;
  setModalOpen: (open: boolean) => void;
  saveSettings: (
    newKeys: Record<string, string>,
    newLocalSettings: LocalSettings
  ) => Promise<void>;
}

const AppSettingsContext = createContext<AppSettingsContextType | undefined>(
  undefined
);

export interface AppSettingsProviderProps {
  requestedKeys: ApiKey[];
  children: React.ReactNode;
}

export function AppSettingsProvider({
  requestedKeys,
  children,
}: AppSettingsProviderProps) {
  const client = useMarketplaceClient();
  const appContext = useAppContext();
  const [keys, setKeys] = useState<Record<ApiKey, string>>(
    {} as Record<ApiKey, string>
  );
  const [localSettings, setLocalSettings] = useState<LocalSettings>(() => ({
    needsToolApproval: true,
    sitecoreToolsExecution: 'frontend',
    ...JSON.parse(localStorage.getItem('marketers-chat-settings') || '{}'),
  }));
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const sitecoreContextId = appContext?.resourceAccess?.[0]?.context?.preview;

  // Load API keys from Sitecore
  useEffect(() => {
    if (!sitecoreContextId) return;

    const fetchKeys = async () => {
      const results = await Promise.all(
        requestedKeys.map(async (name) => {
          const value = await getApiKey(client, sitecoreContextId, name);
          return { name, value: value || '' };
        })
      );

      const newKeys = results.reduce(
        (acc, { name, value }) => {
          acc[name] = value;
          return acc;
        },
        {} as Record<ApiKey, string>
      );

      setKeys(newKeys);
      setLoading(false);

      // If important keys are missing, show modal (e.g. vercel)
      if (requestedKeys.includes('vercel') && !newKeys['vercel']) {
        setIsModalOpen(true);
      }
    };

    fetchKeys();
  }, [sitecoreContextId, client, requestedKeys]);

  const saveSettings = useCallback(
    async (
      newKeys: Record<string, string>,
      newLocalSettings: LocalSettings
    ) => {
      if (!sitecoreContextId) {
        throw new Error('Sitecore context ID is not defined');
      }
      // Save API keys to Sitecore
      const savePromises = Object.entries(newKeys).map(
        async ([name, value]) => {
          if (keys[name as ApiKey] !== value) {
            return saveApiKey(client, sitecoreContextId, name, value);
          }
          return true;
        }
      );

      await Promise.all(savePromises);
      setKeys((prev) => ({ ...prev, ...newKeys }));

      // Save local settings to localStorage
      localStorage.setItem(
        'marketers-chat-settings',
        JSON.stringify(newLocalSettings)
      );
      setLocalSettings(newLocalSettings);

      setIsModalOpen(false);
    },
    [client, sitecoreContextId, keys]
  );

  // Don't render until we know the state of the keys (at least for initial load)
  if (loading && sitecoreContextId) return null;

  return (
    <AppSettingsContext.Provider
      value={{
        keys,
        localSettings,
        setModalOpen: setIsModalOpen,
        saveSettings,
      }}
    >
      {children}
      <AppSettingsModal
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        keys={keys}
        localSettings={localSettings}
        onSave={saveSettings}
        isClosable={requestedKeys.every((k) => !!keys[k])}
      />
    </AppSettingsContext.Provider>
  );
}

/**
 * Hook to access an API key by name.
 */
export function useApiKey(name: ApiKey): string | undefined {
  const context = useContext(AppSettingsContext);
  if (context === undefined) {
    throw new Error('useApiKey must be used within an AppSettingsProvider');
  }
  return context.keys[name];
}

/**
 * Hook to access local settings.
 */
export function useLocalSettings() {
  const context = useContext(AppSettingsContext);
  if (context === undefined) {
    throw new Error(
      'useLocalSettings must be used within an AppSettingsProvider'
    );
  }
  return context.localSettings;
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);
  if (context === undefined) {
    throw new Error(
      'useAppSettings must be used within an AppSettingsProvider'
    );
  }
  return {
    setModalOpen: context.setModalOpen,
    localSettings: context.localSettings,
    saveSettings: context.saveSettings,
  };
}
