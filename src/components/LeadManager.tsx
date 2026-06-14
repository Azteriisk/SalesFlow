import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  MapPin, 
  Phone, 
  Globe, 
  CheckCircle, 
  X, 
  ChevronRight, 
  Clock, 
  Calendar, 
  CheckSquare, 
  Archive, 
  AlertOctagon,
  Send,
  Plus,
  DollarSign,
  Trash2,
  Camera
} from 'lucide-react';
import { dbService, getWeekId } from '../services/db';
import type { Lead, LeadStatus, Visit, Call, Quote, EmailLog, Profile } from '../services/db';
import { triggerConfetti } from '../services/confetti';
import { playSound } from '../services/sound';

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

interface LeadManagerProps {
  location: { latitude: number; longitude: number };
}

const LeadManager: React.FC<LeadManagerProps> = ({ location: _location }) => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [allLeadsForSearch, setAllLeadsForSearch] = useState<Lead[]>([]);
  const [leadsWithActivities, setLeadsWithActivities] = useState<Set<string>>(new Set());
  const [onlySearchWithActivities, setOnlySearchWithActivities] = useState<boolean>(false);
  const [repProfile, setRepProfile] = useState<Profile | null>(null);
  
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<LeadStatus | 'all'>('pending_osv');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [drawerTab, setDrawerTab] = useState<'log' | 'quotes' | 'email'>('log');
  
  // OSV Log Form State
  const [spokeWith, setSpokeWith] = useState<string>('');
  const [gatekeeper, setGatekeeper] = useState<string>('');
  const [decisionMaker, setDecisionMaker] = useState<string>('');
  const [isDecisionMaker, setIsDecisionMaker] = useState<boolean>(false);
  const [nextStep, setNextStep] = useState<'phone_block' | 'appointment_set' | 'sold' | 'no_value' | 'never_visit' | 'snooze'>('phone_block');
  const [visitNotes, setVisitNotes] = useState<string>('');
  const [dealValue, setDealValue] = useState<number>(0);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [goalAchievedModal, setGoalAchievedModal] = useState<string | null>(null);
  
  // Appointment sub-state
  const [apptDate, setApptDate] = useState<string>('');
  const [apptTime, setApptTime] = useState<string>('');

  // Snooze sub-state
  const [snoozeMonths, setSnoozeMonths] = useState<number>(3);

  // History state
  const [visitLogs, setVisitLogs] = useState<Visit[]>([]);
  const [callLogs, setCallLogs] = useState<Call[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);

  // Quotes Manager Form State
  const [quoteAmount, setQuoteAmount] = useState<string>('');
  const [quoteDesc, setQuoteDesc] = useState<string>('');

  // Email Outreach Form State
  const [emailRecipient, setEmailRecipient] = useState<string>('');
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [emailBody, setEmailBody] = useState<string>('');
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState<number>(-1);

  // Precompiled email templates
  const TEMPLATES = [
    {
      name: 'Uniform Presentation Pitch',
      subject: 'Uniform Service Presentation - {{businessName}}',
      body: 'Hi {{dmName}},\n\nIt was great meeting you (or your team) at {{businessName}}. I wanted to follow up and see if we could schedule a quick 10-minute presentation to show you how our laundered uniform and facility services can help improve your team\'s presentation, cleanliness, and safety.\n\nBest regards,\n{{repName}}\nSales Representative'
    },
    {
      name: 'Visit Follow-up',
      subject: 'Nice meeting you at {{businessName}}',
      body: 'Hi {{dmName}},\n\nThank you for taking a moment to speak with me during my visit to {{businessName}} today.\n\nI wanted to follow up and see if you had any questions regarding the facility laundry solutions we discussed.\n\nBest,\n{{repName}}\nSales Representative'
    },
    {
      name: 'Outreach & Marketing Pitch',
      subject: 'Laundering & Cleanliness Solutions for {{businessName}}',
      body: 'Hi {{dmName}},\n\nI noticed your business located at {{address}} and wanted to reach out regarding our customized laundering service for uniforms, floor mats, and shop towels. We help businesses in the {{category}} industry maintain safety and cleanliness standards.\n\nLet me know if you have time for a quick call next week.\n\nSincerely,\n{{repName}}\nSales Representative'
    }
  ];

  // Load leads from DB
  const loadLeads = async () => {
    try {
      let loaded: Lead[] = [];
      if (activeFilter === 'all') {
        loaded = await dbService.getAllLeads();
      } else {
        loaded = await dbService.getLeadsByStatus(activeFilter);
      }
      
      // Filter out blacklisted/no_value from the default list views to keep it clean, 
      // unless specifically looking at them
      const filtered = loaded.filter(l => {
        if (activeFilter === 'all') {
          return l.status !== 'never_visit' && l.status !== 'no_value';
        }
        return true;
      });

      setLeads(filtered);

      // Fetch all leads for global search
      const all = await dbService.getAllLeads();
      setAllLeadsForSearch(all);

      // Fetch profile settings
      const prof = await dbService.getProfile();
      setRepProfile(prof);

      // Find which leads have activities
      const visits = await dbService.getAllVisits();
      const calls = await dbService.getAllCalls();
      const emails = await dbService.getAllEmails();
      const activeIds = new Set<string>([
        ...visits.map(v => v.leadId),
        ...calls.map(c => c.leadId),
        ...emails.map(e => e.leadId)
      ]);
      setLeadsWithActivities(activeIds);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadLeads();
  }, [activeFilter]);

  // Load logs when a lead is selected
  useEffect(() => {
    if (!selectedLead) return;
    const fetchLogs = async () => {
      const visits = await dbService.getVisitsForLead(selectedLead.id);
      const calls = await dbService.getCallsForLead(selectedLead.id);
      const emails = await dbService.getEmailsForLead(selectedLead.id);
      setVisitLogs(visits);
      setCallLogs(calls);
      setEmailLogs(emails);
      
      // Initialize form fields from lead details
      setGatekeeper(selectedLead.gatekeeper || '');
      setDecisionMaker(selectedLead.decisionMaker || '');
      setDealValue(selectedLead.dealValue || 0);

      // Reset fields
      setQuoteAmount('');
      setQuoteDesc('');
      setEmailRecipient('');
      setEmailSubject('');
      setEmailBody('');
      setSelectedTemplateIndex(-1);
      setDrawerTab('log');
      setAttachedImages([]);
    };
    fetchLogs();
  }, [selectedLead]);

  // Filter and search computation
  const filteredLeads = (searchQuery.trim() !== '' ? allLeadsForSearch : leads).filter(lead => {
    // If onlySearchWithActivities is checked, lead must have activities
    if (searchQuery.trim() !== '' && onlySearchWithActivities && !leadsWithActivities.has(lead.id)) {
      return false;
    }

    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;

    const nameMatch = lead.name.toLowerCase().includes(q);
    const phoneMatch = lead.phone ? lead.phone.toLowerCase().includes(q) : false;
    const addressMatch = lead.address.toLowerCase().includes(q);
    const dmMatch = lead.decisionMaker ? lead.decisionMaker.toLowerCase().includes(q) : false;
    const gkMatch = lead.gatekeeper ? lead.gatekeeper.toLowerCase().includes(q) : false;

    return nameMatch || phoneMatch || addressMatch || dmMatch || gkMatch;
  });

  const handleSelectLead = (lead: Lead) => {
    setSelectedLead(lead);
    // Reset form values
    setSpokeWith('');
    setIsDecisionMaker(false);
    setVisitNotes('');
    setNextStep('phone_block');
    setAttachedImages([]);
  };

  // Submit OSV Visit log
  const handleLogOsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;

    let apptDetails = '';
    if (nextStep === 'appointment_set') {
      apptDetails = `Appointment set for ${apptDate} at ${apptTime}. `;
    } else if (nextStep === 'sold') {
      apptDetails = `Deal Closed Won for $${dealValue}. `;
    }

    const newVisit: Visit = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
      leadId: selectedLead.id,
      timestamp: Date.now(),
      outcome: nextStep,
      spokeWith: spokeWith || undefined,
      isDecisionMaker,
      notes: `${apptDetails}${visitNotes}`.trim(),
      images: attachedImages.length > 0 ? attachedImages : undefined
    };

    const achievementsBefore = await dbService.checkAchievementsBeforeActivity();

    // Save visit log
    await dbService.addVisit(newVisit);

    // Update lead values based on next step choice
    const updatedLead: Lead = {
      ...selectedLead,
      gatekeeper: gatekeeper || selectedLead.gatekeeper,
      decisionMaker: decisionMaker || selectedLead.decisionMaker,
      status: nextStep === 'snooze' ? 'snoozed_osv' : nextStep as LeadStatus,
      notes: visitNotes || selectedLead.notes
    };

    if (nextStep === 'snooze') {
      // Calculate snooze timestamp
      const date = new Date();
      date.setMonth(date.getMonth() + snoozeMonths);
      updatedLead.snoozeUntil = date.getTime();
      updatedLead.status = 'snoozed_osv';
    } else {
      updatedLead.snoozeUntil = undefined;
    }

    if (nextStep === 'sold') {
      updatedLead.dealValue = dealValue;
    }

    await dbService.saveLead(updatedLead);

    // Check targets after
    const now = new Date();
    const currentWeekId = getWeekId(now);
    const plan = await dbService.getWeeklyPlan(currentWeekId);
    
    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);
    const todayStartTs = todayStart.getTime();
    
    const allVisitsAfter = await dbService.getAllVisits();
    const allCallsAfter = await dbService.getAllCalls();
    
    const days: ('sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday')[] = [
      'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
    ];
    const currentDay = days[now.getDay()];
    
    const dailyOsvTarget = plan.targets[currentDay]?.osv ?? 0;
    
    const weeklyOsvTarget = 
      plan.targets.monday.osv + 
      plan.targets.tuesday.osv + 
      plan.targets.wednesday.osv + 
      plan.targets.thursday.osv + 
      plan.targets.friday.osv;
      
    const weeklyApptTarget = 
      plan.targets.monday.appointments + 
      plan.targets.tuesday.appointments + 
      plan.targets.wednesday.appointments + 
      plan.targets.thursday.appointments + 
      plan.targets.friday.appointments;
      
    const osvTodayAfter = allVisitsAfter.filter(v => v.timestamp >= todayStartTs).length;
    const osvWeekAfter = allVisitsAfter.filter(v => v.timestamp >= plan.startDate).length;
    
    const apptsFromVisitsWeekAfter = allVisitsAfter.filter(v => v.timestamp >= plan.startDate && v.outcome === 'appointment_set').length;
    const apptsFromCallsWeekAfter = allCallsAfter.filter(c => c.timestamp >= plan.startDate && c.outcome === 'appointment_set').length;
    const apptsWeekAfter = apptsFromVisitsWeekAfter + apptsFromCallsWeekAfter;

    // Check newly met
    let modalMsg: string | null = null;

    if (!achievementsBefore.weeklyApptMetBefore && weeklyApptTarget > 0 && apptsWeekAfter >= weeklyApptTarget) {
      modalMsg = `🏆 Weekly Presentations Goal Achieved! (${apptsWeekAfter}/${weeklyApptTarget} set)`;
    } else if (!achievementsBefore.weeklyOsvMetBefore && weeklyOsvTarget > 0 && osvWeekAfter >= weeklyOsvTarget) {
      modalMsg = `🏆 Weekly OSV Target Achieved! (${osvWeekAfter}/${weeklyOsvTarget} visited)`;
    } else if (!achievementsBefore.dailyOsvMetBefore && dailyOsvTarget > 0 && osvTodayAfter >= dailyOsvTarget) {
      modalMsg = `🏆 Daily OSV Target Achieved! (${osvTodayAfter}/${dailyOsvTarget} visited)`;
    }

    if (modalMsg) {
      triggerConfetti();
      setGoalAchievedModal(modalMsg);
      setTimeout(() => {
        setGoalAchievedModal(null);
      }, 3500);
    } else {
      playSound('click');
    }

    setAttachedImages([]);
    setSelectedLead(null);
    loadLeads();
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const compressedList: string[] = [];

    for (const file of files) {
      try {
        const compressed = await compressImage(file);
        compressedList.push(compressed);
      } catch (err) {
        console.error('Error compressing image:', err);
      }
    }

    setAttachedImages(prev => [...prev, ...compressedList]);
    e.target.value = '';
  };

  const handleRemoveImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  // Quotes Manager Handlers
  const handleAddQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;
    const amt = parseFloat(quoteAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid amount.');
      return;
    }
    
    const newQuote: Quote = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
      amount: amt,
      description: quoteDesc.trim(),
      status: 'pending',
      createdAt: Date.now()
    };
    
    const updatedQuotes = [...(selectedLead.quotes || []), newQuote];
    const updatedLead = {
      ...selectedLead,
      quotes: updatedQuotes
    };
    
    await dbService.saveLead(updatedLead);
    setSelectedLead(updatedLead);
    setQuoteAmount('');
    setQuoteDesc('');
    loadLeads();
  };

  const handleDeleteQuote = async (quoteId: string) => {
    if (!selectedLead || !selectedLead.quotes) return;
    if (!window.confirm('Are you sure you want to delete this quote?')) return;
    
    const updatedQuotes = selectedLead.quotes.filter(q => q.id !== quoteId);
    const updatedLead = {
      ...selectedLead,
      quotes: updatedQuotes
    };
    
    await dbService.saveLead(updatedLead);
    setSelectedLead(updatedLead);
    loadLeads();
  };

  const handleUpdateQuoteStatus = async (quoteId: string, status: 'approved' | 'rejected') => {
    if (!selectedLead || !selectedLead.quotes) return;
    
    let shouldMarkSold = false;
    let approvedAmount = 0;
    
    const updatedQuotes = selectedLead.quotes.map(q => {
      if (q.id === quoteId) {
        if (status === 'approved' && q.status !== 'approved') {
          approvedAmount = q.amount;
          shouldMarkSold = window.confirm(`Quote of $${q.amount} approved! Would you like to mark this account as Sold and set its contract value to $${q.amount}?`);
        }
        return { ...q, status };
      }
      return q;
    });
    
    const updatedLead: Lead = {
      ...selectedLead,
      quotes: updatedQuotes
    };
    
    if (shouldMarkSold) {
      updatedLead.status = 'sold';
      updatedLead.dealValue = approvedAmount;
      
      const newVisit: Visit = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
        leadId: selectedLead.id,
        timestamp: Date.now(),
        outcome: 'sold',
        isDecisionMaker: true,
        notes: `Account marked as SOLD via Quote approval ($${approvedAmount}).`
      };
      await dbService.addVisit(newVisit);
    }
    
    await dbService.saveLead(updatedLead);
    setSelectedLead(updatedLead);
    loadLeads();
    
    const visits = await dbService.getVisitsForLead(updatedLead.id);
    setVisitLogs(visits);
  };

  // Email Outreach Console Handlers
  const applyTemplate = (tpl: typeof TEMPLATES[0]) => {
    if (!selectedLead) return;
    
    const dm = selectedLead.decisionMaker || selectedLead.gatekeeper || 'Manager';
    const rep = repProfile?.repName || 'Sales Representative';
    const cat = selectedLead.category.replace(/_/g, ' ');
    
    const replacePlaceholders = (text: string) => {
      return text
        .replace(/{{businessName}}/g, selectedLead.name)
        .replace(/{{dmName}}/g, dm)
        .replace(/{{repName}}/g, rep)
        .replace(/{{address}}/g, selectedLead.address)
        .replace(/{{category}}/g, cat);
    };

    setEmailSubject(replacePlaceholders(tpl.subject));
    setEmailBody(replacePlaceholders(tpl.body));
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;

    if (!emailRecipient) {
      alert('Please enter a recipient email address.');
      return;
    }

    const mailtoUrl = `mailto:${encodeURIComponent(emailRecipient)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    
    window.open(mailtoUrl, '_blank');

    const newEmail: EmailLog = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
      leadId: selectedLead.id,
      timestamp: Date.now(),
      subject: emailSubject,
      body: emailBody,
      outcome: 'sent'
    };

    await dbService.addEmail(newEmail);
    
    const emails = await dbService.getEmailsForLead(selectedLead.id);
    setEmailLogs(emails);
    
    alert('Device email client opened! Sent email has been logged in the activities history.');
  };

  const getStatusLabel = (status: LeadStatus) => {
    return status.replace(/_/g, ' ');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
      {/* Search Header */}
      <div className="lead-manager-header">
        <h2 style={{ fontFamily: 'Outfit', fontSize: '1.35rem' }}>Sales Pipeline</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', width: '100%' }}>
          <div className="search-input-wrapper">
            <Search />
            <input 
              type="text" 
              placeholder="Search by name, phone, contact, address..." 
              className="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {searchQuery.trim() !== '' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem', fontSize: '0.8rem', color: 'hsl(var(--text-secondary))' }}>
              <input 
                type="checkbox" 
                id="onlyActive" 
                style={{ width: '14px', height: '14px', accentColor: 'hsl(var(--primary))', cursor: 'pointer' }}
                checked={onlySearchWithActivities}
                onChange={(e) => setOnlySearchWithActivities(e.target.checked)}
              />
              <label htmlFor="onlyActive" style={{ cursor: 'pointer' }}>
                Only search businesses with existing activities
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      {searchQuery.trim() === '' && (
        <div className="filter-tabs">
          <button 
            className={`filter-tab ${activeFilter === 'pending_osv' ? 'active' : ''}`}
            onClick={() => setActiveFilter('pending_osv')}
          >
            Pending OSVs ({leads.filter(l => l.status === 'pending_osv').length})
          </button>
          <button 
            className={`filter-tab ${activeFilter === 'phone_block' ? 'active' : ''}`}
            onClick={() => setActiveFilter('phone_block')}
          >
            Phone Block ({leads.filter(l => l.status === 'phone_block').length})
          </button>
          <button 
            className={`filter-tab ${activeFilter === 'appointment_set' ? 'active' : ''}`}
            onClick={() => setActiveFilter('appointment_set')}
          >
            Appointments ({leads.filter(l => l.status === 'appointment_set').length})
          </button>
          <button 
            className={`filter-tab ${activeFilter === 'snoozed_osv' ? 'active' : ''}`}
            onClick={() => setActiveFilter('snoozed_osv')}
          >
            Snoozed
          </button>
          <button 
            className={`filter-tab ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            All
          </button>
        </div>
      )}

      {/* List results */}
      {filteredLeads.length === 0 ? (
        <div className="empty-state">
          <Users />
          <h3>Pipeline Empty</h3>
          <p>Go to the <strong style={{ fontWeight: 'bold', color: 'hsl(var(--primary))' }}>Discover</strong> tab to swipe right on new businesses nearby and build your pipeline.</p>
        </div>
      ) : (
        <div className="lead-list">
          {filteredLeads.map(lead => (
            <div 
              key={lead.id} 
              className="lead-list-item"
              onClick={() => handleSelectLead(lead)}
            >
              <div className="lead-info">
                <span className="lead-name">{lead.name}</span>
                <span className="lead-address">📍 {lead.address}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className={`lead-action-badge ${lead.status}`}>
                  {getStatusLabel(lead.status)}
                </span>
                <ChevronRight style={{ width: '16px', height: '16px', color: 'hsl(var(--text-muted))' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Slide drawer for Lead file & Tabs Content */}
      {selectedLead && (
        <div className="drawer-backdrop" onClick={() => setSelectedLead(null)}>
          <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3 style={{ fontFamily: 'Outfit', fontSize: '1.2rem' }}>Account Profile</h3>
              <button className="close-btn" onClick={() => setSelectedLead(null)}>
                <X style={{ width: '22px', height: '22px' }} />
              </button>
            </div>

            <div className="drawer-body">
              {/* Core Business Metadata Card */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <h2 style={{ fontSize: '1.3rem', fontFamily: 'Outfit' }}>{selectedLead.name}</h2>
                <div style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <MapPin style={{ width: '14px', height: '14px' }} /> {selectedLead.address}
                  </span>
                  {selectedLead.phone && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Phone style={{ width: '14px', height: '14px' }} /> {selectedLead.phone}
                    </span>
                  )}
                  {selectedLead.website && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Globe style={{ width: '14px', height: '14px' }} /> 
                      <a href={selectedLead.website} target="_blank" rel="noreferrer" style={{ color: 'hsl(var(--secondary))', textDecoration: 'none' }}>
                        Visit Website
                      </a>
                    </span>
                  )}
                  {selectedLead.dealValue && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'hsl(var(--success))', fontWeight: 600 }}>
                      <DollarSign style={{ width: '14px', height: '14px' }} /> Closed Deal: ${selectedLead.dealValue}
                    </span>
                  )}
                </div>
                {selectedLead.notes && (
                  <div style={{ 
                    marginTop: '0.75rem', 
                    padding: '0.75rem', 
                    background: 'hsl(var(--bg-tertiary))', 
                    borderRadius: '8px', 
                    borderLeft: selectedLead.notes.includes('[Team Sync Update]') ? '3px solid hsl(var(--primary))' : '3px solid hsl(var(--border-muted))',
                    fontSize: '0.8rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600, color: selectedLead.notes.includes('[Team Sync Update]') ? 'hsl(var(--primary))' : 'hsl(var(--text-secondary))', marginBottom: '0.3rem' }}>
                      <span>📋 Account Notes</span>
                      {selectedLead.notes.includes('[Team Sync Update]') && (
                        <span style={{ fontSize: '0.7rem', padding: '1px 5px', borderRadius: '3px', background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))', fontWeight: 700 }}>
                          TEAM SHARED
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, whiteSpace: 'pre-line', color: 'hsl(var(--text-primary))', lineHeight: '1.4' }}>
                      {selectedLead.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Sub-Tabs for Drawer Option Pages */}
              <div className="filter-tabs" style={{ margin: '0.75rem 0', background: 'hsl(var(--bg-tertiary))', padding: '3px', borderRadius: '8px', border: '1px solid hsl(var(--border-muted))' }}>
                <button 
                  type="button"
                  className={`filter-tab ${drawerTab === 'log' ? 'active' : ''}`}
                  onClick={() => setDrawerTab('log')}
                  style={{ flex: 1, padding: '0.4rem', fontSize: '0.78rem' }}
                >
                  Log & History
                </button>
                <button 
                  type="button"
                  className={`filter-tab ${drawerTab === 'quotes' ? 'active' : ''}`}
                  onClick={() => setDrawerTab('quotes')}
                  style={{ flex: 1, padding: '0.4rem', fontSize: '0.78rem' }}
                >
                  Quotes ({selectedLead.quotes?.length || 0})
                </button>
                <button 
                  type="button"
                  className={`filter-tab ${drawerTab === 'email' ? 'active' : ''}`}
                  onClick={() => setDrawerTab('email')}
                  style={{ flex: 1, padding: '0.4rem', fontSize: '0.78rem' }}
                >
                  Draft Email
                </button>
              </div>

              {/* TAB 1: Log Visit and History */}
              {drawerTab === 'log' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* History logs accordion */}
                  {(visitLogs.length > 0 || callLogs.length > 0 || emailLogs.length > 0) && (
                    <div className="glass-panel" style={{ padding: '0.85rem' }}>
                      <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'hsl(var(--text-muted))', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
                        Activity History
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '140px', overflowY: 'auto' }}>
                        {/* Visits */}
                        {visitLogs.map(v => (
                          <div key={v.id} style={{ fontSize: '0.78rem', borderBottom: '1px dashed hsl(var(--border-muted))', paddingBottom: '0.3rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'hsl(var(--text-muted))', alignItems: 'center' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                🚶 OSV Logged
                                {v.id.startsWith('team-sync-') && (
                                  <span style={{ fontSize: '0.65rem', padding: '1px 4px', borderRadius: '3px', background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))', fontWeight: 600 }}>
                                    Team Shared
                                  </span>
                                )}
                              </span>
                              <span>{new Date(v.timestamp).toLocaleDateString()}</span>
                            </div>
                            <p style={{ color: 'hsl(var(--text-secondary))', marginTop: '0.1rem' }}>
                              <strong>Outcome:</strong> {getStatusLabel(v.outcome as any)}. {v.spokeWith && `Spoke to ${v.spokeWith}.`} {v.notes}
                            </p>
                            {v.images && v.images.length > 0 && (
                              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', overflowX: 'auto', paddingBottom: '0.2rem' }}>
                                {v.images.map((img, idx) => (
                                  <img 
                                    key={idx} 
                                    src={img} 
                                    alt="Visit attachment" 
                                    onClick={() => setLightboxImage(img)}
                                    style={{ width: '48px', height: '48px', borderRadius: '6px', objectFit: 'cover', cursor: 'pointer', border: '1px solid hsl(var(--border-muted))', flexShrink: 0 }} 
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                        {/* Calls */}
                        {callLogs.map(c => (
                          <div key={c.id} style={{ fontSize: '0.78rem', borderBottom: '1px dashed hsl(var(--border-muted))', paddingBottom: '0.3rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'hsl(var(--text-muted))' }}>
                              <span>📞 Call Block Logged</span>
                              <span>{new Date(c.timestamp).toLocaleDateString()}</span>
                            </div>
                            <p style={{ color: 'hsl(var(--text-secondary))', marginTop: '0.1rem' }}>
                              <strong>Outcome:</strong> {getStatusLabel(c.outcome as any)}. {c.notes}
                            </p>
                            {c.images && c.images.length > 0 && (
                              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', overflowX: 'auto', paddingBottom: '0.2rem' }}>
                                {c.images.map((img, idx) => (
                                  <img 
                                    key={idx} 
                                    src={img} 
                                    alt="Call attachment" 
                                    onClick={() => setLightboxImage(img)}
                                    style={{ width: '48px', height: '48px', borderRadius: '6px', objectFit: 'cover', cursor: 'pointer', border: '1px solid hsl(var(--border-muted))', flexShrink: 0 }} 
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                        {/* Emails */}
                        {emailLogs.map(e => (
                          <div key={e.id} style={{ fontSize: '0.78rem', borderBottom: '1px dashed hsl(var(--border-muted))', paddingBottom: '0.3rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'hsl(var(--text-muted))' }}>
                              <span>📧 Email Outreach</span>
                              <span>{new Date(e.timestamp).toLocaleDateString()}</span>
                            </div>
                            <p style={{ color: 'hsl(var(--text-secondary))', marginTop: '0.1rem' }}>
                              <strong>Subject:</strong> {e.subject}
                            </p>
                            <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.72rem', whiteSpace: 'pre-line', marginTop: '0.1rem' }}>
                              {e.body}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Log OSV Form */}
                  <form onSubmit={handleLogOsv} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <h4 style={{ borderBottom: '1px solid hsl(var(--border-muted))', paddingBottom: '0.4rem', fontFamily: 'Outfit' }}>
                      Log On-Site Visit
                    </h4>
                    
                    <div className="form-group">
                      <label>Spoke With (Person Met)</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="e.g. Brandon (Manager)"
                        value={spokeWith}
                        onChange={(e) => setSpokeWith(e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div className="form-group">
                        <label>Gatekeeper Name</label>
                        <input 
                          type="text" 
                          className="form-control" 
                          placeholder="e.g. Sarah at front desk"
                          value={gatekeeper}
                          onChange={(e) => setGatekeeper(e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label>Decision Maker Name</label>
                        <input 
                          type="text" 
                          className="form-control" 
                          placeholder="e.g. Bob (Owner)"
                          value={decisionMaker}
                          onChange={(e) => setDecisionMaker(e.target.value)}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input 
                        type="checkbox" 
                        id="isDM" 
                        style={{ width: '16px', height: '16px', accentColor: 'hsl(var(--primary))' }}
                        checked={isDecisionMaker}
                        onChange={(e) => setIsDecisionMaker(e.target.checked)}
                      />
                      <label htmlFor="isDM" style={{ fontSize: '0.82rem', color: 'hsl(var(--text-secondary))', cursor: 'pointer' }}>
                        Met directly with Decision Maker
                      </label>
                    </div>

                    {/* Next steps workflow action selectors */}
                    <div className="form-group">
                      <label>Next Step Action</label>
                      <div className="radio-group">
                        <div 
                          className={`radio-card ${nextStep === 'phone_block' ? 'active' : ''}`}
                          onClick={() => setNextStep('phone_block')}
                        >
                          <CheckSquare style={{ color: 'hsl(var(--primary))', width: '18px', height: '18px' }} />
                          <span className="radio-card-title">Add to Phone Block</span>
                        </div>

                        <div 
                          className={`radio-card ${nextStep === 'appointment_set' ? 'active' : ''}`}
                          onClick={() => setNextStep('appointment_set')}
                        >
                          <Calendar style={{ color: 'hsl(var(--success))', width: '18px', height: '18px' }} />
                          <span className="radio-card-title">Set Appointment</span>
                        </div>

                        <div 
                          className={`radio-card ${nextStep === 'sold' ? 'active' : ''}`}
                          onClick={() => setNextStep('sold')}
                        >
                          <DollarSign style={{ color: 'hsl(var(--success))', width: '18px', height: '18px' }} />
                          <span className="radio-card-title">Account Sold</span>
                        </div>

                        <div 
                          className={`radio-card ${nextStep === 'no_value' ? 'active' : ''}`}
                          onClick={() => setNextStep('no_value')}
                        >
                          <Archive style={{ color: 'hsl(var(--text-muted))', width: '18px', height: '18px' }} />
                          <span className="radio-card-title">No Value (Re-discover)</span>
                        </div>

                        <div 
                          className={`radio-card ${nextStep === 'snooze' ? 'active' : ''}`}
                          onClick={() => setNextStep('snooze')}
                        >
                          <Clock style={{ color: 'hsl(var(--secondary))', width: '18px', height: '18px' }} />
                          <span className="radio-card-title">Revisit Later (Snooze)</span>
                        </div>

                        <div 
                          className={`radio-card ${nextStep === 'never_visit' ? 'active' : ''}`}
                          onClick={() => setNextStep('never_visit')}
                          style={{ gridColumn: '1 / -1' }}
                        >
                          <AlertOctagon style={{ color: 'hsl(var(--danger))', width: '18px', height: '18px' }} />
                          <span className="radio-card-title" style={{ color: 'hsl(var(--danger))' }}>Never Visit (Blacklist)</span>
                        </div>
                      </div>
                    </div>

                    {/* Sub-inputs dependent on next step choice */}
                    {nextStep === 'appointment_set' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: 'hsl(var(--bg-tertiary) / 0.5)', padding: '0.75rem', borderRadius: '8px' }}>
                        <div className="form-group">
                          <label>Date</label>
                          <input 
                            type="date" 
                            required
                            className="form-control"
                            value={apptDate}
                            onChange={(e) => setApptDate(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Time</label>
                          <input 
                            type="time" 
                            required
                            className="form-control"
                            value={apptTime}
                            onChange={(e) => setApptTime(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {nextStep === 'sold' && (
                      <div className="form-group" style={{ background: 'hsl(var(--bg-tertiary) / 0.5)', padding: '0.75rem', borderRadius: '8px' }}>
                        <label>Deal Contract Value ($ / month or year)</label>
                        <input 
                          type="number" 
                          required
                          min={1}
                          className="form-control"
                          placeholder="e.g. 1500"
                          value={dealValue}
                          onChange={(e) => setDealValue(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    )}

                    {nextStep === 'snooze' && (
                      <div className="form-group" style={{ background: 'hsl(var(--bg-tertiary) / 0.5)', padding: '0.75rem', borderRadius: '8px' }}>
                        <label>Snooze Duration (Months)</label>
                        <select 
                          className="form-control"
                          value={snoozeMonths}
                          onChange={(e) => setSnoozeMonths(parseInt(e.target.value, 10))}
                        >
                          <option value={1}>1 Month</option>
                          <option value={2}>2 Months</option>
                          <option value={3}>3 Months</option>
                          <option value={6}>6 Months (Revisit)</option>
                          <option value={12}>12 Months (Revisit in 1 yr)</option>
                        </select>
                      </div>
                    )}

                    <div className="form-group">
                      <label>Visit Notes / Comments</label>
                      <textarea 
                        className="form-control" 
                        rows={3} 
                        placeholder="e.g. Owner Bob is only there in the morning. Likes laundered floor mats..."
                        value={visitNotes}
                        onChange={(e) => setVisitNotes(e.target.value)}
                      />
                    </div>

                    {/* Image Attachment Section */}
                    <div className="form-group">
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Attach Images</span>
                        <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>Optional</span>
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label className="btn-secondary" style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          gap: '0.4rem', 
                          padding: '0.45rem 0.75rem', 
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          width: 'fit-content',
                          borderRadius: '6px',
                          border: '1px solid hsl(var(--border-muted))',
                          background: 'hsl(var(--bg-tertiary))'
                        }}>
                          <Camera style={{ width: '15px', height: '15px' }} />
                          Add Photo
                          <input 
                            type="file" 
                            accept="image/*" 
                            multiple 
                            onChange={handleImageChange} 
                            style={{ display: 'none' }} 
                          />
                        </label>
                        
                        {attachedImages.length > 0 && (
                          <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', 
                            gap: '0.5rem',
                            marginTop: '0.25rem' 
                          }}>
                            {attachedImages.map((img, idx) => (
                              <div key={idx} style={{ position: 'relative', width: '60px', height: '60px', borderRadius: '6px', overflow: 'hidden', border: '1px solid hsl(var(--border-muted))' }}>
                                <img src={img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Preview" />
                                <button 
                                  type="button" 
                                  onClick={() => handleRemoveImage(idx)}
                                  style={{
                                    position: 'absolute',
                                    top: '2px',
                                    right: '2px',
                                    background: 'rgba(0,0,0,0.6)',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '16px',
                                    height: '16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'white',
                                    cursor: 'pointer',
                                    padding: 0
                                  }}
                                >
                                  <X style={{ width: '10px', height: '10px' }} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem' }}>
                      <CheckCircle style={{ width: '16px', height: '16px' }} />
                      Submit Visit Log
                    </button>
                  </form>
                </div>
              )}

              {/* TAB 2: Quotes Manager */}
              {drawerTab === 'quotes' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h4 style={{ borderBottom: '1px solid hsl(var(--border-muted))', paddingBottom: '0.4rem', fontFamily: 'Outfit' }}>
                    Quote Attachments
                  </h4>

                  {/* Add Quote form */}
                  <form onSubmit={handleAddQuote} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'hsl(var(--bg-tertiary) / 0.5)', padding: '0.75rem', borderRadius: '8px', border: '1px solid hsl(var(--border-muted))' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Create custom service quote</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem' }}>
                      <div className="form-group">
                        <label>Quote Amount ($ value)</label>
                        <input 
                          type="number"
                          min={1}
                          required
                          className="form-control"
                          placeholder="e.g. 1200"
                          value={quoteAmount}
                          onChange={(e) => setQuoteAmount(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label>Service Description & Details</label>
                        <textarea
                          className="form-control"
                          rows={2}
                          required
                          placeholder="e.g. Laundered uniforms, weekly floor mats, safety towels..."
                          value={quoteDesc}
                          onChange={(e) => setQuoteDesc(e.target.value)}
                        />
                      </div>
                    </div>
                    <button type="submit" className="btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', alignSelf: 'flex-start' }}>
                      <Plus style={{ width: '14px', height: '14px' }} />
                      Attach Quote
                    </button>
                  </form>

                  {/* List of Quotes */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--text-secondary))' }}>Attached Quotes ({selectedLead.quotes?.length || 0})</span>
                    {(!selectedLead.quotes || selectedLead.quotes.length === 0) ? (
                      <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', fontStyle: 'italic', padding: '0.5rem' }}>
                        No quotes attached to this business. Use the form above to add one.
                      </p>
                    ) : (
                      selectedLead.quotes.map(q => (
                        <div key={q.id} className="glass-card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'hsl(var(--success))' }}>${q.amount}</span>
                            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                              <span className={`lead-action-badge ${q.status === 'approved' ? 'appointment_set' : q.status === 'rejected' ? 'never_visit' : 'phone_block'}`} style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem' }}>
                                {q.status}
                              </span>
                              <button 
                                type="button" 
                                style={{ background: 'transparent', border: 'none', color: 'hsl(var(--danger))', cursor: 'pointer', padding: '0.1rem' }}
                                onClick={() => handleDeleteQuote(q.id)}
                              >
                                <Trash2 style={{ width: '13px', height: '13px' }} />
                              </button>
                            </div>
                          </div>
                          <p style={{ fontSize: '0.78rem', color: 'hsl(var(--text-secondary))' }}>{q.description}</p>
                          <span style={{ fontSize: '0.68rem', color: 'hsl(var(--text-muted))' }}>Added: {new Date(q.createdAt).toLocaleDateString()}</span>
                          
                          {q.status === 'pending' && (
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem' }}>
                              <button 
                                type="button" 
                                className="btn-primary" 
                                style={{ flex: 1, padding: '0.3rem 0', fontSize: '0.75rem', background: 'hsl(var(--success))', borderColor: 'hsl(var(--success))' }}
                                onClick={() => handleUpdateQuoteStatus(q.id, 'approved')}
                              >
                                Approve
                              </button>
                              <button 
                                type="button" 
                                className="btn-secondary" 
                                style={{ flex: 1, padding: '0.3rem 0', fontSize: '0.75rem' }}
                                onClick={() => handleUpdateQuoteStatus(q.id, 'rejected')}
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: Email Outreach Console */}
              {drawerTab === 'email' && (
                <form onSubmit={handleSendEmail} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h4 style={{ borderBottom: '1px solid hsl(var(--border-muted))', paddingBottom: '0.4rem', fontFamily: 'Outfit' }}>
                    Email Marketing & Outreach
                  </h4>

                  <div className="form-group">
                    <label>Outreach Template</label>
                    <select 
                      className="form-control"
                      value={selectedTemplateIndex}
                      onChange={(e) => {
                        const idx = parseInt(e.target.value, 10);
                        setSelectedTemplateIndex(idx);
                        if (idx >= 0) {
                          applyTemplate(TEMPLATES[idx]);
                        } else {
                          setEmailSubject('');
                          setEmailBody('');
                        }
                      }}
                    >
                      <option value={-1}>-- Select a Template --</option>
                      {TEMPLATES.map((t, i) => (
                        <option key={i} value={i}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Recipient Email Address</label>
                    <input 
                      type="email" 
                      required
                      placeholder="e.g. info@business.com" 
                      className="form-control"
                      value={emailRecipient}
                      onChange={(e) => setEmailRecipient(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Subject Line</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Email Subject" 
                      className="form-control"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Email Body Content</label>
                    <textarea 
                      className="form-control" 
                      rows={8} 
                      required
                      placeholder="Write your email body here..."
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="btn-primary">
                    <Send style={{ width: '16px', height: '16px' }} />
                    Open Mail Client & Log Activity
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Lightbox Modal */}
      {lightboxImage && (
        <div 
          className="modal-overlay" 
          style={{ 
            zIndex: 1000, 
            background: 'rgba(0,0,0,0.85)', 
            backdropFilter: 'blur(8px)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            position: 'fixed',
            inset: 0
          }}
          onClick={() => setLightboxImage(null)}
        >
          <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%', display: 'flex', flexDirection: 'column', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
            <button 
              type="button" 
              onClick={() => setLightboxImage(null)}
              style={{
                alignSelf: 'flex-end',
                background: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: '1rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                marginBottom: '0.5rem',
                fontWeight: 600
              }}
            >
              <X style={{ width: '20px', height: '20px' }} />
              <span>Close</span>
            </button>
            <img 
              src={lightboxImage} 
              alt="Expanded view" 
              style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: '8px', border: '2px solid hsl(var(--border-muted))', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} 
            />
          </div>
        </div>
      )}

      {goalAchievedModal && (
        <div 
          className="modal-overlay" 
          style={{ 
            zIndex: 10000, 
            background: 'rgba(0,0,0,0.75)', 
            backdropFilter: 'blur(10px)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            position: 'fixed',
            inset: 0
          }}
        >
          <div 
            className="glass-card" 
            style={{ 
              width: '90%', 
              maxWidth: '400px', 
              padding: '2.5rem 2rem', 
              textAlign: 'center', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              gap: '1rem',
              animation: 'scaleUp 0.3s ease-out',
              border: '2px solid hsl(var(--primary))',
              boxShadow: '0 10px 40px rgba(142, 192, 124, 0.25)',
              position: 'relative'
            }}
          >
            <div style={{ fontSize: '3.5rem', animation: 'bounce-slow 2s infinite ease-in-out' }}>🎉</div>
            <h3 style={{ fontFamily: 'Outfit', fontSize: '1.5rem', color: 'hsl(var(--primary))', margin: 0 }}>
              Goal Achieved!
            </h3>
            <p style={{ fontSize: '1.05rem', color: 'hsl(var(--text-secondary))', margin: 0, fontWeight: 500, lineHeight: '1.4' }}>
              {goalAchievedModal}
            </p>
            <button 
              className="btn-primary" 
              onClick={() => setGoalAchievedModal(null)}
              style={{ marginTop: '0.75rem', width: '100%', maxWidth: '140px', padding: '0.5rem 1rem' }}
            >
              Awesome
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadManager;
