import React, { useState, useEffect } from 'react';
import { 
  Building, 
  Users, 
  Target, 
  BarChart3, 
  Settings2,
  Lock,
  Check,
  Award,
  Plus,
  Trash2
} from 'lucide-react';
import { useOrganization, useUser, OrganizationSwitcher, CreateOrganization, OrganizationList } from '../services/clerk';
import { INDUSTRY_CATEGORIES } from '../services/places';
import { dbService } from '../services/db';
import { getSupabase } from '../services/supabase';
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
  
  const [activeTab, setActiveTab] = useState<'roster' | 'analytics' | 'settings' | 'achievements'>('roster');
  const [orgView, setOrgView] = useState<'prompt' | 'create' | 'list'>('prompt');
  const [localOrg, setLocalOrg] = useState<Organization | null>(null);

  // Form states for creating custom achievements
  const [achTitle, setAchTitle] = useState<string>('');
  const [achDesc, setAchDesc] = useState<string>('');
  const [achIcon, setAchIcon] = useState<string>('🎯');
  const [achMetric, setAchMetric] = useState<'visits' | 'calls' | 'revenue' | 'appointments' | 'prospects'>('visits');
  const [achValue, setAchValue] = useState<number>(10);
  const [achTimeframe, setAchTimeframe] = useState<'weekly' | 'quarterly' | 'yearly' | 'lifetime'>('weekly');
  const [lockTargets, setLockTargets] = useState<boolean>(true);
  const [dailyOsv, setDailyOsv] = useState<number>(10);
  const [dailyCalls, setDailyCalls] = useState<number>(30);
  const [companyIndustries, setCompanyIndustries] = useState<string[]>([]);
  const [userOsvCount, setUserOsvCount] = useState<number>(0);

  const [memberProfiles, setMemberProfiles] = useState<any[]>([]);

  const isAdmin = membership?.role === 'org:admin';

  // Load member profiles from Supabase for admin management
  useEffect(() => {
    if (!organization) {
      setMemberProfiles([]);
      return;
    }

    const loadMemberProfiles = async () => {
      const supabase = getSupabase();
      if (!supabase) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('organization_id', organization.id);

      if (!error && data) {
        setMemberProfiles(data);
      }
    };

    loadMemberProfiles();
  }, [organization]);

  const handleRemovePersonalAchievement = async (memberUserId: string, achievementId: string) => {
    if (!confirm('Are you sure you want to remove this personal achievement from this rep?')) return;

    const supabase = getSupabase();
    if (!supabase) return;

    // Find the member profile
    const memberProf = memberProfiles.find(p => p.clerk_user_id === memberUserId);
    if (!memberProf) return;

    const achievements = memberProf.personal_achievements ? 
      (typeof memberProf.personal_achievements === 'string' ? JSON.parse(memberProf.personal_achievements) : memberProf.personal_achievements) : [];
    const updated = achievements.filter((ach: any) => ach.id !== achievementId);

    // Update remote profile
    const { error } = await supabase
      .from('profiles')
      .update({ 
        personal_achievements: JSON.stringify(updated),
        updated_at: new Date().toISOString()
      })
      .eq('clerk_user_id', memberUserId);

    if (error) {
      console.error('Failed to update remote profile:', error.message);
      alert('Failed to remove achievement: ' + error.message);
    } else {
      // Update local state
      setMemberProfiles(prev => prev.map(p => p.clerk_user_id === memberUserId ? { ...p, personal_achievements: updated } : p));
      alert('Achievement removed from rep\'s profile successfully.');
    }
  };

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
          defaultIndustries: ['auto_repair', 'warehouse', 'restaurant', 'contractor', 'waste_management'],
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
      setCompanyIndustries(org.defaultIndustries || ['auto_repair', 'warehouse', 'restaurant', 'contractor', 'waste_management']);

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
      defaultIndustries: companyIndustries,
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

  const handleAddCustomAchievement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localOrg || !achTitle.trim() || !achDesc.trim()) return;

    const newAch = {
      id: `custom_ach_${Date.now()}`,
      title: achTitle.trim(),
      description: achDesc.trim(),
      icon: achIcon,
      targetMetric: achMetric,
      targetValue: achValue,
      timeframe: achTimeframe,
      createdAt: Date.now()
    };

    const updatedAchievements = [...(localOrg.customAchievements || []), newAch];
    const updated: Organization = {
      ...localOrg,
      customAchievements: updatedAchievements
    };

    try {
      await dbService.saveOrganization(updated);
      setLocalOrg(updated);
      setAchTitle('');
      setAchDesc('');
      setAchIcon('🎯');
      setAchMetric('visits');
      setAchValue(10);
      setAchTimeframe('weekly');
      alert('Custom company achievement added successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to add custom achievement.');
    }
  };

  const handleDeleteCustomAchievement = async (id: string) => {
    if (!localOrg) return;
    if (!confirm('Are you sure you want to delete this custom achievement?')) return;

    const updatedAchievements = (localOrg.customAchievements || []).filter(ach => ach.id !== id);
    const updated: Organization = {
      ...localOrg,
      customAchievements: updatedAchievements
    };

    try {
      await dbService.saveOrganization(updated);
      setLocalOrg(updated);
      alert('Custom achievement deleted.');
    } catch (err) {
      console.error(err);
      alert('Failed to delete custom achievement.');
    }
  };

  if (!organization) {
    return (
      <div className="tab-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem', textAlign: 'center' }}>
        {orgView === 'prompt' ? (
          <>
            <Building style={{ width: '48px', height: '48px', color: 'hsl(var(--text-muted))', marginBottom: '1rem' }} />
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: '1.5rem', marginBottom: '0.5rem' }}>No Organization Active</h2>
            <p style={{ color: 'hsl(var(--text-secondary))', marginBottom: '1.5rem', maxWidth: '350px' }}>
              Create a new company organization or join an existing one to access shared target locking, team leaderboards, and collaborative mapping.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '280px', marginTop: '0.5rem' }}>
              <button 
                className="btn-primary" 
                onClick={() => setOrgView('create')}
                style={{ cursor: 'pointer', padding: '0.75rem 1rem', fontSize: '0.9rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                Create a New Company
              </button>
              <button 
                className="btn-secondary" 
                onClick={() => setOrgView('list')}
                style={{ cursor: 'pointer', padding: '0.75rem 1rem', fontSize: '0.9rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                Join / Switch Company
              </button>
            </div>
          </>
        ) : orgView === 'create' ? (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'center' }}>
            <button 
              onClick={() => setOrgView('prompt')}
              className="btn-secondary"
              style={{ marginBottom: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
            >
              ← Back to Options
            </button>
            <div style={{ background: 'hsl(var(--bg-secondary))', padding: '1.5rem', borderRadius: '16px', border: '1px solid hsl(var(--border-muted))', width: '100%', maxWidth: '480px', display: 'flex', justifyContent: 'center' }}>
              <CreateOrganization 
                afterCreateOrganizationUrl="/#company"
              />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'center' }}>
            <button 
              onClick={() => setOrgView('prompt')}
              className="btn-secondary"
              style={{ marginBottom: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
            >
              ← Back to Options
            </button>
            <div style={{ background: 'hsl(var(--bg-secondary))', padding: '1.5rem', borderRadius: '16px', border: '1px solid hsl(var(--border-muted))', width: '100%', maxWidth: '480px', display: 'flex', justifyContent: 'center' }}>
              <OrganizationList 
                hidePersonal={true}
                afterCreateOrganizationUrl="/#company"
                afterSelectOrganizationUrl="/#company"
              />
            </div>
          </div>
        )}
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
        <button 
          onClick={() => setActiveTab('achievements')}
          className={`tab-button-small ${activeTab === 'achievements' ? 'active' : ''}`}
          style={{ padding: '0.5rem 1rem', borderRadius: '2rem', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', background: activeTab === 'achievements' ? 'hsl(var(--primary))' : 'hsl(var(--bg-secondary))', color: activeTab === 'achievements' ? 'white' : 'hsl(var(--text-secondary))', border: 'none', cursor: 'pointer' }}
        >
          <Award style={{ width: '16px', height: '16px' }} /> Achievements
        </button>
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
              const matchingProfile = memberProfiles.find(p => p.clerk_user_id === publicData?.userId);
              const achievements = matchingProfile?.personal_achievements ? 
                (typeof matchingProfile.personal_achievements === 'string' ? JSON.parse(matchingProfile.personal_achievements) : matchingProfile.personal_achievements) : [];

              return (
                <div key={mem.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem', background: 'hsl(var(--bg-primary))', borderRadius: '8px', border: '1px solid hsl(var(--border-muted))' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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

                  {/* Stretch Achievements Roster */}
                  {achievements.length > 0 && (
                    <div style={{ borderTop: '1px solid hsl(var(--border-muted))', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'hsl(var(--text-secondary))', marginBottom: '0.35rem' }}>Personal Stretch Badges:</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {achievements.map((ach: any) => (
                          <div 
                            key={ach.id} 
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.3rem', 
                              background: 'hsl(var(--bg-secondary))', 
                              border: '1px solid hsl(var(--border-muted))', 
                              borderRadius: '4px', 
                              padding: '0.25rem 0.4rem',
                              fontSize: '0.72rem'
                            }}
                          >
                            <span>{ach.icon || '🎯'}</span>
                            <span style={{ fontWeight: 500, color: 'hsl(var(--text-primary))' }}>{ach.title}</span>
                            <span style={{ color: 'hsl(var(--text-muted))', fontSize: '0.65rem' }}>({ach.targetValue} {ach.targetMetric})</span>
                            
                            {isAdmin && (
                              <button 
                                onClick={() => handleRemovePersonalAchievement(publicData?.userId || '', ach.id)}
                                style={{ 
                                  background: 'none', 
                                  border: 'none', 
                                  color: 'hsl(var(--danger))', 
                                  cursor: 'pointer', 
                                  padding: '0 0 0 0.2rem',
                                  fontSize: '0.85rem',
                                  lineHeight: 1,
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                                title="Remove personal achievement"
                              >
                                &times;
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
            <div className="form-group" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
              <label style={{ marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.9rem' }}>Company Default Target Industries</label>
              <div className="category-checklist" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                {(profile.categories || INDUSTRY_CATEGORIES).map(category => {
                  const isChecked = companyIndustries.includes(category.id);
                  return (
                    <div 
                      key={category.id} 
                      className={`category-card ${isChecked ? 'active' : ''}`}
                      onClick={() => {
                        if (isChecked) {
                          setCompanyIndustries(companyIndustries.filter(item => item !== category.id));
                        } else {
                          setCompanyIndustries([...companyIndustries, category.id]);
                        }
                      }}
                      style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
                    >
                      <div style={{ 
                        width: '14px', 
                        height: '14px', 
                        borderRadius: '3px', 
                        border: '1px solid hsl(var(--border-muted))', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        background: isChecked ? 'hsl(var(--primary))' : 'transparent'
                      }}>
                        {isChecked && <Check style={{ width: '10px', height: '10px', stroke: '#fff' }} />}
                      </div>
                      <span>{category.label}</span>
                    </div>
                  );
                })}
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

      {activeTab === 'achievements' && localOrg && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Create custom achievements section for admins */}
          {isAdmin && (
            <div className="glass-panel" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <Plus style={{ width: '18px', height: '18px', color: 'hsl(var(--primary))' }} />
                <h3 style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: '1.1rem', margin: 0 }}>Create Company Achievement</h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', marginBottom: '1rem' }}>
                Design a custom milestone badge for your sales reps to unlock on their dashboards.
              </p>

              <form onSubmit={handleAddCustomAchievement} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label>Badge Icon</label>
                    <input 
                      type="text" 
                      maxLength={2}
                      value={achIcon}
                      onChange={(e) => setAchIcon(e.target.value)}
                      className="form-input" 
                      style={{ fontSize: '1.25rem', textAlign: 'center' }}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Badge Title</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Summer Heatwave"
                      value={achTitle}
                      onChange={(e) => setAchTitle(e.target.value)}
                      className="form-input" 
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Description / Criteria</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Complete 50 On-Site Visits this quarter"
                    value={achDesc}
                    onChange={(e) => setAchDesc(e.target.value)}
                    className="form-input" 
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label>Target Metric</label>
                    <select
                      className="form-input"
                      value={achMetric}
                      onChange={(e) => setAchMetric(e.target.value as any)}
                      style={{ background: 'hsl(var(--bg-primary))', border: '1px solid hsl(var(--border-muted))', padding: '0.4rem', borderRadius: '6px', color: 'hsl(var(--text-primary))' }}
                    >
                      <option value="visits">Visits</option>
                      <option value="calls">Calls</option>
                      <option value="revenue">Revenue ($)</option>
                      <option value="appointments">Appointments</option>
                      <option value="prospects">Prospects Added</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Target Goal Value</label>
                    <input 
                      type="number" 
                      min={1}
                      value={achValue}
                      onChange={(e) => setAchValue(parseInt(e.target.value, 10) || 0)}
                      className="form-input" 
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Timeframe</label>
                    <select
                      className="form-input"
                      value={achTimeframe}
                      onChange={(e) => setAchTimeframe(e.target.value as any)}
                      style={{ background: 'hsl(var(--bg-primary))', border: '1px solid hsl(var(--border-muted))', padding: '0.4rem', borderRadius: '6px', color: 'hsl(var(--text-primary))' }}
                    >
                      <option value="weekly">Weekly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                      <option value="lifetime">Lifetime</option>
                    </select>
                  </div>
                </div>

                <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem', cursor: 'pointer' }}>
                  + Create Company Achievement
                </button>
              </form>
            </div>
          )}

          {/* List custom achievements */}
          <div className="glass-panel" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid hsl(var(--border-muted))', paddingBottom: '0.5rem' }}>
              <Award style={{ width: '18px', height: '18px', color: 'hsl(var(--primary))' }} />
              <h3 style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: '1.1rem', margin: 0 }}>Active Custom Achievements</h3>
              <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginLeft: 'auto' }}>
                {localOrg.customAchievements?.length || 0} Defined
              </span>
            </div>

            {(!localOrg.customAchievements || localOrg.customAchievements.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'hsl(var(--text-muted))', fontSize: '0.88rem' }}>
                No custom achievements defined for {localOrg.name} yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {localOrg.customAchievements.map((ach) => (
                  <div 
                    key={ach.id} 
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      padding: '0.75rem 1rem',
                      background: 'hsla(var(--primary-glow) / 0.05)',
                      border: '1px solid hsla(var(--primary) / 0.15)',
                      borderRadius: '10px',
                      position: 'relative'
                    }}
                  >
                    <div style={{ fontSize: '1.75rem' }}>{ach.icon}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', flex: 1 }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'hsl(var(--text-primary))' }}>{ach.title}</span>
                      <span style={{ fontSize: '0.78rem', color: 'hsl(var(--text-secondary))' }}>{ach.description}</span>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.66rem', background: 'hsl(var(--bg-secondary))', border: '1px solid hsl(var(--border-muted))', color: 'hsl(var(--text-muted))', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 600 }}>
                          🎯 {ach.targetValue} {ach.targetMetric}
                        </span>
                        <span style={{ fontSize: '0.66rem', background: 'hsl(var(--bg-secondary))', border: '1px solid hsl(var(--border-muted))', color: 'hsl(var(--text-muted))', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 600 }}>
                          ⏰ {ach.timeframe}
                        </span>
                      </div>
                    </div>
                    {isAdmin && (
                      <button 
                        type="button"
                        onClick={() => handleDeleteCustomAchievement(ach.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'hsl(var(--error))',
                          cursor: 'pointer',
                          opacity: 0.7,
                          padding: '0.25rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '4px'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'hsla(var(--error) / 0.1)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <Trash2 style={{ width: '16px', height: '16px' }} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyManagement;
