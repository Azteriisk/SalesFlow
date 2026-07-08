import * as RealClerk from '@clerk/clerk-react';
import * as MockClerk from './clerk-mock';

// Decide whether to use mock or real Clerk
// We use Mock Clerk if:
// 1. We are running on localhost AND the Clerk key is a production live key (which Clerk blocks on localhost)
// 2. Or if no Clerk key is set
const isLocalhost = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';
const isLiveKey = publishableKey.startsWith('pk_live_');

export const useMock = isLocalhost && (isLiveKey || !publishableKey);

export const ClerkProvider = useMock ? MockClerk.ClerkProvider : RealClerk.ClerkProvider;
export const SignedIn = useMock ? MockClerk.SignedIn : RealClerk.SignedIn;
export const SignedOut = useMock ? MockClerk.SignedOut : RealClerk.SignedOut;
export const SignIn = useMock ? MockClerk.SignIn : RealClerk.SignIn;
export const UserButton = useMock ? MockClerk.UserButton : RealClerk.UserButton;
export const useUser = (useMock ? MockClerk.useUser : RealClerk.useUser) as unknown as typeof RealClerk.useUser;
export const useOrganization = (useMock ? MockClerk.useOrganization : RealClerk.useOrganization) as unknown as typeof RealClerk.useOrganization;
export const OrganizationSwitcher = useMock ? MockClerk.OrganizationSwitcher : RealClerk.OrganizationSwitcher;
export const CreateOrganization = useMock ? MockClerk.CreateOrganization : RealClerk.CreateOrganization;
export const OrganizationList = useMock ? MockClerk.OrganizationList : RealClerk.OrganizationList;
