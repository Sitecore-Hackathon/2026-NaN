'use client';

import React from 'react';
import {
  Auth0ContextInterface,
  Auth0Provider,
  GetTokenSilentlyOptions,
  useAuth0,
  withAuthenticationRequired,
} from '@auth0/auth0-react';
import { useAppContext } from './marketplace';

export const WithAuth = withAuthenticationRequired(
  ({ children }: { children: React.ReactNode }) => children
);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const appContext = useAppContext();
  const authParams = {
    organization_id: appContext.organizationId,
    tenant_id: appContext['marketplaceAppTenantId'],
    product_codes: `mkp_${process.env.NEXT_PUBLIC_SITECORE_APP_ID}`,
    audience: process.env.NEXT_PUBLIC_AUTH0_AUDIENCE,
    redirect_uri: process.env.NEXT_PUBLIC_APP_BASE_URL + `/?redirect=${window.location.pathname}`,
    scope: process.env.NEXT_PUBLIC_AUTH0_SCOPE,
  };

  const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
  const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;

  if (!domain || !clientId) {
    throw new Error('Auth0 domain and client ID are required');
  }

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        ...authParams,
      }}
    >
      <WithAuth>{children}</WithAuth>
    </Auth0Provider>
  );
};

export const useAuth = (): Auth0ContextInterface => {
  const { getAccessTokenSilently, ...rest } = useAuth0();
  const appContext = useAppContext();

  const customGetAccessTokenSilently = (options?: GetTokenSilentlyOptions) => {
    return getAccessTokenSilently({
      ...options,
      authorizationParams: {
        ...options?.authorizationParams,
        organization_id: appContext.organizationId,
        tenant_id: appContext['marketplaceAppTenantId'],
      },
    });
  };

  return {
    ...rest,
    getAccessTokenSilently:
      customGetAccessTokenSilently as Auth0ContextInterface['getAccessTokenSilently'],
  };
};
