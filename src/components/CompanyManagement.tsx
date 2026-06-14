import React, { useState, useEffect } from 'react';
import { 
  Building, 
  Users, 
  Target, 
  BarChart3, 
  Settings2,
  Lock
} from 'lucide-react';
import { useOrganization, useUser, OrganizationSwitcher } from '@clerk/clerk-react';
import { dbService } from '../services/db';
import type { Profile, Organization } from '../services/db';

interface CompanyManagementProps {
  profile: Profile;
  onProfileUpdate: (p: Profile) => void;
}

const CompanyManagement: React.FC<CompanyManagementProps> = ({ profile, onProfileUpdate }) => {
  const { organization, membership, memberships } = useOrganization({
    memberships: {
      infinite: true,
      keepPreviousData: true,
    }
  });
  const { user } = useUser();
  
  const [activeTab, setActiveTab] = useState<'roster' | 'analytics' | 'settings'>('roster');
  const [localOrg, setLocalOrg] = useState<Organization | null>(null);
  const [lockTargets, setLockTargets] = useState<boolean>(true);
  const [dailyOsv, setDailyOsv] = useState<number>(10);
  const [dailyCalls, setDailyCalls] = useState<number>(30);
  const [userOsvCount, setUserOsvCount] = useState<number>(0);

  const isAdmin = membership?.role === 'org:admin';

  // Sync active Clerk Organization to Local IndexedDB config
  useEffect(() => {
    if (!organization) {
      setLocalOrg(null);
      return;
    }

    const syncOrg = async () => {
      let org = await dbService.getOrganization(organization.id);
      if (!org) {
        org = {
          id: organization.id,
          name: organization.name,
          adminUserIds: [user?.id || ''],
          memberUserIds: [user?.id || ''],
          defaultTargets: {
            osv: 10,
            calls: 30,
            appointments: 2,
            revenue: 500
          },
          achievementConfig: {
            lockTargets: true
          },
          logoUrl: organization.imageUrl
        };
        await dbService.saveOrganization(org);
      }

      setLocalOrg(org);
      setLockTargets(org.achievementConfig?.lockTargets ?? true);
      setDailyOsv(org.defaultTargets.osv);
      setDailyCalls(org.defaultTargets.calls);

      // Save organization link in profile
      if (profile.organizationId !== organization.id) {
        onProfileUpdate({
          ...profile,
          organizationId: organization.id
        });
      }
    };

    syncOrg();
  }, [organization, user, profile, onProfileUpdate]);

  // Load user's actual weekly progress for B2B dashboard comparison
  useEffect(() => {
    const loadUserStats = async () => {
      const allVisits = await dbService.getAllVisits();
      // Calculate start of current week
      const now = new Date();
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now.setDate(diff));
      monday.setHours(0, 0, 0, 0);

      const weeklyVisits = allVisits.filter(v => v.timestamp >= monday.getTime());
      setUserOsvCount(weeklyVisits.length);
    };
    loadUserStats();
  }, []);

  const handleSaveGovernance = async () => {
    if (!organization || !localOrg) return;

    const updated: Organization = {
      ...localOrg,
      defaultTargets: {
        ...localOrg.defaultTargets,
        osv: dailyOsv,
        calls: dailyCalls
      },
      achievementConfig: {
        ...localOrg.achievementConfig,
        lockTargets
      }
    };

    try {
      await dbService.saveOrganization(updated);
      setLocalOrg(updated);
      alert('Organization Quota Governance policy updated successfully.');
    } catch (err) {
      console.error(err);
      alert('Failed to save governance policy.');
    }
  };

  if (!organization) {
    return (
      <div className="tab-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem', textAlign: 'center' }}>
        <Building style={{ width: '48px', height: '48px', color: 'hsl(var(--text-muted))', marginBottom: '1rem' }} />
        <h2 style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: '1.5rem', marginBottom: '0.5rem' }}>No Organization Active</h2>
        <p style={{ color: 'hsl(var(--text-secondary))', marginBottom: '1.5rem', maxWidth: '300px' }}>
          Please select or create an organization using the switcher below to access company targets and team features.
        </p>
        <div style={{ background: 'hsl(var(--bg-secondary))', padding: '0.75rem', borderRadius: '12px', border: '1px solid hsl(var(--border-muted))' }}>
          <OrganizationSwitcher 
            afterCreateOrganizationUrl="/#company"
            afterSelectOrganizationUrl="/#company"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="tab-content">
      {/* Header Organization Details */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        {organization.imageUrl && (
          <img 
            src={organization.imageUrl} 
            alt="Logo" 
            style={{ width: '56px', height: '56px', borderRadius: '12px', objectFit: 'cover', border: '1px solid hsl(var(--border-muted))' }} 
          />
        )}
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: '1.3rem', margin: 0, color: 'hsl(var(--text-primary))' }}>
            {organization.name}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Users style={{ width: '13px', height: '13px' }} />
              {memberships?.data?.length || 1} Members
            </span>
            <span className="badge" style={{ background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))', fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
              {isAdmin ? 'Admin / Manager' : 'Sales Rep'}
            </span>
          </div>
        </div>
        <OrganizationSwitcher />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
        <button 
          onClick={() => setActiveTab('roster')}
          className={`tab-button-small ${activeTab === 'roster' ? 'active' : ''}`}
          style={{ padding: '0.5rem 1rem', borderRadius: '2rem', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', background: activeTab === 'roster' ? 'hsl(var(--primary))' : 'hsl(var(--bg-secondary))', color: activeTab === 'roster' ? 'white' : 'hsl(var(--text-secondary))', border: 'none', cursor: 'pointer' }}
        >
          <Users style={{ width: '16px', height: '16px' }} /> Roster
        </button>
        <button 
          onClick={() => setActiveTab('analytics')}
          className={`tab-button-small ${activeTab === 'analytics' ? 'active' : ''}`}
          style={{ padding: '0.5rem 1rem', borderRadius: '2rem', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', background: activeTab === 'analytics' ? 'hsl(var(--primary))' : 'hsl(var(--bg-secondary))', color: activeTab === 'analytics' ? 'white' : 'hsl(var(--text-secondary))', border: 'none', cursor: 'pointer' }}
        >
          <BarChart3 style={{ width: '16px', height: '16px' }} /> Analytics
        </button>
        {isAdmin && (
          <button 
            onClick={() => setActiveTab('settings')}
            className={`tab-button-small ${activeTab === 'settings' ? 'active' : ''}`}
            style={{ padding: '0.5rem 1rem', borderRadius: '2rem', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', background: activeTab === 'settings' ? 'hsl(var(--primary))' : 'hsl(var(--bg-secondary))', color: activeTab === 'settings' ? 'white' : 'hsl(var(--text-secondary))', border: 'none', cursor: 'pointer' }}
          >
            <Settings2 style={{ width: '16px', height: '16px' }} /> Governance
          </button>
        )}
      </div>

      {/* Tab Panels */}
      {activeTab === 'roster' && (
        <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.5rem' }}>Team Members</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {memberships?.data?.map((mem) => {
              const publicData = mem.publicUserData;
              const firstName = publicData?.firstName || '';
              const lastName = publicData?.lastName || '';
              const name = [firstName, lastName].filter(Boolean).join(' ') || publicData?.identifier || 'Team Member';
              const roleName = mem.role === 'org:admin' ? 'Manager / Admin' : 'Sales Rep';
              const initials = [firstName.charAt(0), lastName.charAt(0)].filter(Boolean).join('') || '?';
              const imageUrl = publicData?.imageUrl;
              return (
                <div key={mem.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', background: 'hsl(var(--bg-primary))', borderRadius: '8px', border: '1px solid hsl(var(--border-muted))' }}>
                  {imageUrl ? (
                    <img src={imageUrl} alt={name} style={{ width: '38px', height: '38px', borderRadius: '50%', border: '1px solid hsl(var(--border-muted))' }} />
                  ) : (
                    <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'hsl(var(--secondary) / 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--secondary))', fontWeight: 600, fontSize: '0.85rem' }}>
                      {initials}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'hsl(var(--text-primary))' }}>{name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>{roleName}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="glass-panel" style={{ padding: '1rem' }}>
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: '1.1rem', marginBottom: '1rem' }}>Leaderboard (This Week)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ fontWeight: 600, color: 'hsl(var(--text-primary))' }}>1. {user?.fullName || 'You'}</span>
                <span style={{ color: 'hsl(var(--secondary))', fontWeight: 600 }}>{userOsvCount} OSVs</span>
              </div>
              <div style={{ height: '6px', background: 'hsl(var(--bg-primary))', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (userOsvCount / dailyOsv) * 100)}%`, background: 'hsl(var(--secondary))', borderRadius: '3px' }} />
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginTop: '1rem', fontStyle: 'italic', textAlign: 'center' }}>
              Other team members will appear on this leaderboard in real-time as they perform cloud synchronization.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'settings' && isAdmin && localOrg && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="glass-panel" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Target style={{ width: '18px', height: '18px', color: 'hsl(var(--primary))' }} />
              <h3 style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: '1.1rem', margin: 0 }}>Quota Governance</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', marginBottom: '1rem' }}>
              Define baseline daily targets for your team. You can lock these targets so reps cannot change them.
            </p>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'hsl(var(--bg-primary))', borderRadius: '8px', border: '1px solid hsl(var(--border-muted))', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Lock style={{ width: '16px', height: '16px', color: 'hsl(var(--warning))' }} />
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Lock Targets for Reps</span>
              </div>
              <input 
                type="checkbox" 
                checked={lockTargets} 
                onChange={(e) => setLockTargets(e.target.checked)}
                style={{ accentColor: 'hsl(var(--primary))' }} 
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group">
                <label>Daily OSVs</label>
                <input 
                  type="number" 
                  value={dailyOsv} 
                  onChange={(e) => setDailyOsv(parseInt(e.target.value, 10) || 0)}
                  className="form-input" 
                />
              </div>
              <div className="form-group">
                <label>Daily Calls</label>
                <input 
                  type="number" 
                  value={dailyCalls} 
                  onChange={(e) => setDailyCalls(parseInt(e.target.value, 10) || 0)}
                  className="form-input" 
                />
              </div>
            </div>
            <button 
              className="btn-primary" 
              onClick={handleSaveGovernance}
              style={{ width: '100%', marginTop: '1rem', cursor: 'pointer' }}
            >
              Save Governance Policies
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyManagement;
