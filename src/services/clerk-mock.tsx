import React, { createContext } from 'react';

// Context
const ClerkContext = createContext({
  user: { id: 'user_mock', fullName: 'Demo Sales Rep' },
  organization: { id: 'org_mock', name: 'Demo Organization' }
});

export const ClerkProvider: React.FC<{ children: React.ReactNode; publishableKey?: string }> = ({ children }) => {
  return (
    <ClerkContext.Provider value={{ user: { id: 'user_mock', fullName: 'Demo Sales Rep' }, organization: { id: 'org_mock', name: 'Demo Organization' } }}>
      {children}
    </ClerkContext.Provider>
  );
};

export const SignedIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

export const SignedOut: React.FC<{ children: React.ReactNode }> = () => {
  return null; // Always signed in for local demo/mock mode
};

export const SignIn: React.FC<Record<string, unknown>> = () => {
  return (
    <div style={{ padding: '2rem', textAlign: 'center', background: 'hsl(var(--bg-secondary))', borderRadius: '12px', border: '1px solid hsl(var(--border-muted))' }}>
      <h2>Mock Sign In</h2>
      <p>Authentication is mocked in local offline mode.</p>
    </div>
  );
};

export const UserButton: React.FC = () => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.08)', padding: '0.4rem 0.8rem', borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer' }}>
      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.8rem', color: '#fff' }}>
        D
      </div>
      <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'hsl(var(--text-primary))' }}>Demo Sales Rep</span>
    </div>
  );
};

export const useUser = () => {
  return {
    isSignedIn: true,
    user: {
      id: 'user_mock',
      fullName: 'Demo Sales Rep',
      firstName: 'Demo',
      lastName: 'Sales Rep',
      primaryEmailAddress: { emailAddress: 'demo@salesflow.com' }
    }
  };
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const useOrganization = (_options?: Record<string, unknown>) => {
  return {
    organization: {
      id: 'org_mock',
      name: 'Demo Organization',
      defaultTargets: { osv: 10, calls: 30, appointments: 2, revenue: 500 },
      defaultIndustries: ['auto_repair', 'warehouse']
    },
    membership: {
      role: 'org:admin'
    },
    memberships: {
      data: []
    }
  };
};

export const OrganizationSwitcher: React.FC = () => {
  return (
    <div style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.8rem', fontWeight: 500, padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
      Demo Organization
    </div>
  );
};

export const CreateOrganization: React.FC = () => null;
export const OrganizationList: React.FC<Record<string, unknown>> = () => null;

export const useAuth = () => {
  return {
    getToken: async () => 'mock_supabase_jwt_token',
    isSignedIn: true,
    userId: 'user_mock'
  };
};
