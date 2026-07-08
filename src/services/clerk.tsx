import * as RealClerk from '@clerk/clerk-react';
import * as MockClerk from './clerk-mock';

// Decide whether to use mock or real Clerk
// We use Mock Clerk if:
// 1. No valid Clerk key is provided at all (meaning the build has no environment variables set)
// 2. Or we are on localhost AND the key is a live key (which Clerk blocks on localhost)
const isLocalhost = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';
const isLiveKey = publishableKey.startsWith('pk_live_');
const isTestKey = publishableKey.startsWith('pk_test_');
const hasValidKey = isLiveKey || isTestKey;

export const useMock = !hasValidKey || (isLocalhost && isLiveKey);

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
export const useAuth = (useMock ? MockClerk.useAuth : RealClerk.useAuth) as unknown as typeof RealClerk.useAuth;
