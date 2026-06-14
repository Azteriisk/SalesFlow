import React, { useState } from 'react';
import { 
  Building, 
  Users, 
  Target, 
  BarChart3, 
  Settings2,
  Lock,
  Award
} from 'lucide-react';
import type { Profile, Organization } from '../services/db';

interface CompanyManagementProps {
  profile: Profile;
  onProfileUpdate: (p: Profile) => void;
}

const CompanyManagement: React.FC<CompanyManagementProps> = ({ profile, onProfileUpdate }) => {
  const [activeTab, setActiveTab] = useState<'roster' | 'analytics' | 'settings'>('roster');

  // Mock Organization Data
  const mockOrg: Organization = {
    id: 'org_123',
    name: 'Acme Uniforms & Supply',
    adminUserIds: [profile.clerkUserId || 'user_1'],
    memberUserIds: [profile.clerkUserId || 'user_1', 'user_2', 'user_3'],
    defaultTargets: {
      osv: 10,
      calls: 30,
      appointments: 2,
      revenue: 500
    },
    logoUrl: 'https://ui-avatars.com/api/?name=Acme+Uniforms&background=0D8ABC&color=fff'
  };

  const isAdmin = mockOrg.adminUserIds.includes(profile.clerkUserId || 'user_1');

  if (!profile.organizationId) {
    return (
      <div className="tab-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem', textAlign: 'center' }}>
        <Building style={{ width: '48px', height: '48px', color: 'hsl(var(--text-muted))', marginBottom: '1rem' }} />
        <h2 style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: '1.5rem', marginBottom: '0.5rem' }}>No Organization Linked</h2>
        <p style={{ color: 'hsl(var(--text-secondary))', marginBottom: '1.5rem', maxWidth: '300px' }}>
          Your profile is not currently linked to a company workspace. Join an organization to see your team, collaborate on shared accounts, and view company goals.
        </p>
        <button 
          className="btn-primary"
          onClick={() => {
            // Mock linking for demo purposes
            onProfileUpdate({ ...profile, organizationId: mockOrg.id });
          }}
        >
          Join Acme Uniforms (Demo)
        </button>
      </div>
    );
  }

  return (
    <div className="tab-content">
      {/* Header Profile Card */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <img 
          src={mockOrg.logoUrl} 
          alt="Company Logo" 
          style={{ width: '64px', height: '64px', borderRadius: '12px', border: '1px solid hsl(var(--border-muted))' }} 
        />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: '1.4rem', margin: 0, color: 'hsl(var(--text-primary))' }}>
            {mockOrg.name}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Users style={{ width: '14px', height: '14px' }} />
              {mockOrg.memberUserIds.length} Members
            </span>
            {isAdmin && (
              <span className="badge" style={{ background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))', fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
                Admin
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Internal Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
        <button 
          onClick={() => setActiveTab('roster')}
          className={`tab-button-small ${activeTab === 'roster' ? 'active' : ''}`}
          style={{ padding: '0.5rem 1rem', borderRadius: '2rem', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', background: activeTab === 'roster' ? 'hsl(var(--primary))' : 'hsl(var(--bg-secondary))', color: activeTab === 'roster' ? 'white' : 'hsl(var(--text-secondary))', border: 'none' }}
        >
          <Users style={{ width: '16px', height: '16px' }} /> Roster
        </button>
        <button 
          onClick={() => setActiveTab('analytics')}
          className={`tab-button-small ${activeTab === 'analytics' ? 'active' : ''}`}
          style={{ padding: '0.5rem 1rem', borderRadius: '2rem', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', background: activeTab === 'analytics' ? 'hsl(var(--primary))' : 'hsl(var(--bg-secondary))', color: activeTab === 'analytics' ? 'white' : 'hsl(var(--text-secondary))', border: 'none' }}
        >
          <BarChart3 style={{ width: '16px', height: '16px' }} /> Analytics
        </button>
        {isAdmin && (
          <button 
            onClick={() => setActiveTab('settings')}
            className={`tab-button-small ${activeTab === 'settings' ? 'active' : ''}`}
            style={{ padding: '0.5rem 1rem', borderRadius: '2rem', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', background: activeTab === 'settings' ? 'hsl(var(--primary))' : 'hsl(var(--bg-secondary))', color: activeTab === 'settings' ? 'white' : 'hsl(var(--text-secondary))', border: 'none' }}
          >
            <Settings2 style={{ width: '16px', height: '16px' }} /> Settings
          </button>
        )}
      </div>

      {/* Roster View */}
      {activeTab === 'roster' && (
        <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.5rem' }}>Team Roster</h3>
          {/* Mock Member List */}
          {[
            { name: profile.repName || 'You', role: 'admin', active: true },
            { name: 'Sarah Jenkins', role: 'rep', active: true },
            { name: 'Michael Chen', role: 'manager', active: false }
          ].map((member, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', background: 'hsl(var(--bg-primary))', borderRadius: '8px', border: '1px solid hsl(var(--border-muted))' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'hsl(var(--secondary) / 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--secondary))', fontWeight: 600 }}>
                {member.name.charAt(0)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'hsl(var(--text-primary))' }}>{member.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', textTransform: 'capitalize' }}>{member.role}</div>
              </div>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: member.active ? 'hsl(var(--success))' : 'hsl(var(--text-muted))' }} />
            </div>
          ))}
        </div>
      )}

      {/* Analytics View */}
      {activeTab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="glass-panel" style={{ padding: '1rem' }}>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: '1.1rem', marginBottom: '1rem' }}>Team Leaderboard (This Week)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                { name: 'Sarah Jenkins', value: 45, max: 50, label: 'OSVs' },
                { name: profile.repName || 'You', value: 32, max: 50, label: 'OSVs' },
                { name: 'Michael Chen', value: 18, max: 50, label: 'OSVs' }
              ].map((row, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 500, color: 'hsl(var(--text-primary))' }}>{idx + 1}. {row.name}</span>
                    <span style={{ color: 'hsl(var(--secondary))', fontWeight: 600 }}>{row.value} {row.label}</span>
                  </div>
                  <div style={{ height: '6px', background: 'hsl(var(--bg-primary))', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(row.value / row.max) * 100}%`, background: 'hsl(var(--secondary))', borderRadius: '3px' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Settings View (Admin Only) */}
      {activeTab === 'settings' && isAdmin && (
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
              <input type="checkbox" defaultChecked={true} style={{ accentColor: 'hsl(var(--primary))' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group">
                <label>Daily OSVs</label>
                <input type="number" defaultValue={10} className="form-input" />
              </div>
              <div className="form-group">
                <label>Daily Calls</label>
                <input type="number" defaultValue={30} className="form-input" />
              </div>
            </div>
            <button className="btn-primary" style={{ width: '100%', marginTop: '1rem' }}>Save Governance Policies</button>
          </div>

          <div className="glass-panel" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Award style={{ width: '18px', height: '18px', color: 'hsl(var(--success))' }} />
              <h3 style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: '1.1rem', margin: 0 }}>Achievement Config</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', marginBottom: '1rem' }}>
              Toggle which badge systems are active for your organization.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {['Pacesetter (10 OSVs/Day)', 'Call Crusader (50 Calls)', 'Summit Club (Quarterly)'].map(badge => (
                <label key={badge} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                  <input type="checkbox" defaultChecked={true} style={{ accentColor: 'hsl(var(--success))' }} />
                  {badge}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyManagement;
