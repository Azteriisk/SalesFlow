import React, { useState, useEffect } from 'react';
import { 
  Save, 
  MapPin, 
  Trash2, 
  Download, 
  Check, 
  Compass, 
  Calendar,
  FileSpreadsheet,
  BarChart3,
  TrendingUp,
  Briefcase
} from 'lucide-react';
import { 
  dbService, 
  getWeekId,
  getMonday
} from '../services/db';
import type { Profile, WeeklyPlan, Lead } from '../services/db';
import { INDUSTRY_CATEGORIES } from '../services/places';

interface SettingsProps {
  profile: Profile;
  onProfileUpdate: (p: Profile) => void;
  location: { latitude: number; longitude: number };
  onSimulateLocation: (lat: number, lng: number) => void;
  onResetLocation: () => void;
  isLocationSimulated: boolean;
}

interface ReportStats {
  totalOsv: number;
  totalCalls: number;
  totalAppts: number;
  activeDays: number;
  calendarDays: number;
  avgOsvPerActiveDay: number;
  avgCallsPerActiveDay: number;
  avgOsvPerWeek: number;
  avgCallsPerWeek: number;
  avgApptsPerWeek: number;
  osvToApptRate: number;
  callToApptRate: number;
}

const Settings: React.FC<SettingsProps> = ({
  profile,
  onProfileUpdate,
  location,
  onSimulateLocation,
  onResetLocation,
  isLocationSimulated
}) => {
  const [repName, setRepName] = useState<string>(profile.repName);
  const [searchRadius, setSearchRadius] = useState<number>(profile.searchRadiusKm);
  const [activeIndustries, setActiveIndustries] = useState<string[]>(profile.industryFilters);
  
  // Weekly targets state
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan | null>(null);

  // Custom goals & milestones targets
  const [fiscalYearStart, setFiscalYearStart] = useState<string>(profile.fiscalYearStart || '2026-06-01');
  const [quarterlySummitTarget, setQuarterlySummitTarget] = useState<number>(profile.quarterlySummitTarget || 9000);
  const [quarterlyPresidentsClubTarget, setQuarterlyPresidentsClubTarget] = useState<number>(profile.quarterlyPresidentsClubTarget || 12000);

  // Simulated location state
  const [simLat, setSimLat] = useState<string>(location.latitude.toFixed(6));
  const [simLng, setSimLng] = useState<string>(location.longitude.toFixed(6));

  // Reports Form State
  const [reportStart, setReportStart] = useState<string>(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Default 7 days ago
  );
  const [reportEnd, setReportEnd] = useState<string>(
    new Date().toISOString().split('T')[0] // Default today
  );
  const [reportStats, setReportStats] = useState<ReportStats | null>(null);
  const [reportActivities, setReportActivities] = useState<any[]>([]);

  // Sold Performance Tracker state
  const [soldTrackerTimeframe, setSoldTrackerTimeframe] = useState<
    'day' | 'week' | 'month' | 'year' | 'fiscal_year' | 'quarter' | 'custom_quarter' | 'custom_range'
  >('month');

  // Custom Fiscal Year inputs (starts on Month X, Day Y)
  const [fiscalStartMonth, setFiscalStartMonth] = useState<number>(6); // Default June (6)
  const [fiscalStartDay, setFiscalStartDay] = useState<number>(1);

  // Custom Quarter start month (e.g., June 1st means Q1 is Jun-Aug, Q2 is Sep-Nov, Q3 is Dec-Feb, Q4 is Mar-May)
  const [customQuarterStartMonth, setCustomQuarterStartMonth] = useState<number>(6); // Default June (6)

  // Custom range inputs
  const [soldRangeStart, setSoldRangeStart] = useState<string>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0] // Start of current month
  );
  const [soldRangeEnd, setSoldRangeEnd] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Calculated metrics
  const [soldPerformanceMetrics, setSoldPerformanceMetrics] = useState<{
    totalDeals: number;
    totalRevenue: number;
    avgDealValue: number;
    soldLeadsList: { leadName: string; address: string; date: number; value: number }[];
    startDateLabel: string;
    endDateLabel: string;
  } | null>(null);

  const currentWeekId = getWeekId(new Date());

  const presets = [
    { name: 'Chicago Loop', lat: 41.8781, lng: -87.6298 },
    { name: 'Midtown Manhattan', lat: 40.7589, lng: -73.9851 },
    { name: 'Downtown Houston', lat: 29.7604, lng: -95.3698 },
    { name: 'Downtown Los Angeles', lat: 34.0522, lng: -118.2437 }
  ];

  useEffect(() => {
    const loadPlan = async () => {
      const plan = await dbService.getWeeklyPlan(currentWeekId);
      setWeeklyPlan(plan);
    };
    loadPlan();
  }, [currentWeekId]);

  useEffect(() => {
    setSimLat(location.latitude.toFixed(6));
    setSimLng(location.longitude.toFixed(6));
  }, [location]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeIndustries.length === 0) {
      alert('Please select at least one target industry category.');
      return;
    }

    const updated: Profile = {
      ...profile,
      repName,
      searchRadiusKm: searchRadius,
      industryFilters: activeIndustries,
      fiscalYearStart,
      quarterlySummitTarget: Number(quarterlySummitTarget),
      quarterlyPresidentsClubTarget: Number(quarterlyPresidentsClubTarget)
    };
    onProfileUpdate(updated);
    alert('Profile settings saved successfully.');
  };

  const handleToggleIndustry = (id: string) => {
    if (activeIndustries.includes(id)) {
      setActiveIndustries(activeIndustries.filter(item => item !== id));
    } else {
      setActiveIndustries([...activeIndustries, id]);
    }
  };

  const handleSavePlanner = async () => {
    if (!weeklyPlan) return;
    try {
      await dbService.saveWeeklyPlan(weeklyPlan);
      alert('Weekly planning targets saved successfully.');
    } catch (err) {
      console.error(err);
      alert('Failed to save targets.');
    }
  };

  const handleUpdateTarget = (
    day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday',
    field: 'osv' | 'calls' | 'appointments' | 'revenue',
    val: number
  ) => {
    if (!weeklyPlan) return;
    
    const updatedPlan = {
      ...weeklyPlan,
      targets: {
        ...weeklyPlan.targets,
        [day]: {
          ...weeklyPlan.targets[day],
          [field]: isNaN(val) ? 0 : val
        }
      }
    };
    setWeeklyPlan(updatedPlan);
  };

  // Generate Report function
  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const startTimestamp = new Date(reportStart + 'T00:00:00').getTime();
      const endTimestamp = new Date(reportEnd + 'T23:59:59').getTime();

      if (startTimestamp > endTimestamp) {
        alert('Start Date must be before or equal to End Date.');
        return;
      }

      // Fetch all logs
      const [allVisits, allCalls, allEmails, allLeads] = await Promise.all([
        dbService.getAllVisits(),
        dbService.getAllCalls(),
        dbService.getAllEmails(),
        dbService.getAllLeads()
      ]);

      const leadsMap = new Map<string, Lead>();
      allLeads.forEach(l => leadsMap.set(l.id, l));

      // Filter logs by timeframe
      const visitsInRange = allVisits.filter(v => v.timestamp >= startTimestamp && v.timestamp <= endTimestamp);
      const callsInRange = allCalls.filter(c => c.timestamp >= startTimestamp && c.timestamp <= endTimestamp);
      const emailsInRange = allEmails.filter(e => e.timestamp >= startTimestamp && e.timestamp <= endTimestamp);

      const totalOsv = visitsInRange.length;
      const totalCalls = callsInRange.length;
      
      const apptsFromVisits = visitsInRange.filter(v => v.outcome === 'appointment_set').length;
      const apptsFromCalls = callsInRange.filter(c => c.outcome === 'appointment_set').length;
      const totalAppts = apptsFromVisits + apptsFromCalls;

      // Track active days
      const activeDaysSet = new Set<string>();
      const addActiveDay = (ts: number) => {
        const d = new Date(ts);
        activeDaysSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      };
      visitsInRange.forEach(v => addActiveDay(v.timestamp));
      callsInRange.forEach(c => addActiveDay(c.timestamp));
      emailsInRange.forEach(e => addActiveDay(e.timestamp));
      const activeDays = activeDaysSet.size;

      // Calendar days and weeks
      const diffTime = Math.abs(endTimestamp - startTimestamp);
      const calendarDays = Math.max(Math.ceil(diffTime / (1000 * 60 * 60 * 24)), 1);
      const calendarWeeks = calendarDays / 7;

      // Calculate averages
      const avgOsvPerActiveDay = activeDays > 0 ? parseFloat((totalOsv / activeDays).toFixed(2)) : 0;
      const avgCallsPerActiveDay = activeDays > 0 ? parseFloat((totalCalls / activeDays).toFixed(2)) : 0;
      const avgOsvPerWeek = calendarWeeks > 0 ? parseFloat((totalOsv / calendarWeeks).toFixed(2)) : 0;
      const avgCallsPerWeek = calendarWeeks > 0 ? parseFloat((totalCalls / calendarWeeks).toFixed(2)) : 0;
      const avgApptsPerWeek = calendarWeeks > 0 ? parseFloat((totalAppts / calendarWeeks).toFixed(2)) : 0;

      // Conversion rates
      const osvToApptRate = totalOsv > 0 ? parseFloat(((apptsFromVisits / totalOsv) * 100).toFixed(1)) : 0;
      const callToApptRate = totalCalls > 0 ? parseFloat(((apptsFromCalls / totalCalls) * 100).toFixed(1)) : 0;

      setReportStats({
        totalOsv,
        totalCalls,
        totalAppts,
        activeDays,
        calendarDays,
        avgOsvPerActiveDay,
        avgCallsPerActiveDay,
        avgOsvPerWeek,
        avgCallsPerWeek,
        avgApptsPerWeek,
        osvToApptRate,
        callToApptRate
      });

      // Combine logs to list detail activities
      const visitActivities = visitsInRange.map(v => {
        const lead = leadsMap.get(v.leadId);
        return {
          type: 'OSV Visit',
          timestamp: v.timestamp,
          leadName: lead?.name || 'Unknown Business',
          outcome: v.outcome.replace(/_/g, ' '),
          spokeWith: v.spokeWith || 'N/A',
          notes: v.notes
        };
      });

      const callActivities = callsInRange.map(c => {
        const lead = leadsMap.get(c.leadId);
        return {
          type: 'Cold Call',
          timestamp: c.timestamp,
          leadName: lead?.name || 'Unknown Business',
          outcome: c.outcome.replace(/_/g, ' '),
          spokeWith: lead?.decisionMaker || 'N/A',
          notes: c.notes
        };
      });

      const emailActivities = emailsInRange.map(e => {
        const lead = leadsMap.get(e.leadId);
        return {
          type: 'Email Outreach',
          timestamp: e.timestamp,
          leadName: lead?.name || 'Unknown Business',
          outcome: e.outcome,
          spokeWith: lead?.decisionMaker || 'N/A',
          notes: `Subject: ${e.subject}. Body preview: ${e.body.substring(0, 60)}...`
        };
      });

      const combined = [...visitActivities, ...callActivities, ...emailActivities].sort((a, b) => b.timestamp - a.timestamp);
      setReportActivities(combined);

    } catch (err) {
      console.error(err);
      alert('Failed to generate report details.');
    }
  };

  // Export report as CSV spreadsheet
  const handleExportCSV = () => {
    if (reportActivities.length === 0) return;
    try {
      const headers = ['Type', 'Date', 'Business Name', 'Outcome', 'Contact Person', 'Notes'];
      const rows = reportActivities.map(act => [
        act.type,
        new Date(act.timestamp).toLocaleDateString(),
        act.leadName.replace(/,/g, ' '), // sanitize commas
        act.outcome,
        act.spokeWith.replace(/,/g, ' '),
        act.notes.replace(/,/g, ' ').replace(/\n/g, ' ')
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(e => e.join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `SalesFlow_Activity_Report_${reportStart}_to_${reportEnd}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('CSV export failed.');
    }
  };

  const handleExportDB = async () => {
    try {
      const allLeads = await dbService.getAllLeads();
      const allDecisions = await dbService.getAllDecisions();
      const allVisits = await dbService.getAllVisits();
      const allCalls = await dbService.getAllCalls();
      const allEmails = await dbService.getAllEmails();
      const currentProfile = await dbService.getProfile();

      const backup = {
        exportTime: Date.now(),
        profile: currentProfile,
        leads: allLeads,
        decisions: allDecisions,
        visits: allVisits,
        calls: allCalls,
        emails: allEmails
      };

      const jsonStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `SalesFlow_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Backup generation failed.');
    }
  };

  const handleClearDB = async () => {
    if (window.confirm('Are you sure you want to permanently clear all data? This will delete all pipeline accounts, history, swiped items, and planning targets.')) {
      await dbService.clearAllData();
      alert('Database cleared.');
      window.location.reload();
    }
  };

  const handleSimClick = () => {
    const lat = parseFloat(simLat);
    const lng = parseFloat(simLng);
    if (isNaN(lat) || isNaN(lng)) {
      alert('Please enter valid coordinates.');
      return;
    }
    onSimulateLocation(lat, lng);
  };

  const handlePresetSelect = (lat: number, lng: number) => {
    onSimulateLocation(lat, lng);
  };

  const calculateSoldPerformance = async () => {
    try {
      const [allLeads, allVisits, allCalls] = await Promise.all([
        dbService.getAllLeads(),
        dbService.getAllVisits(),
        dbService.getAllCalls()
      ]);

      const now = new Date();
      let startTs = 0;
      let endTs = 0;

      const formatLocalDate = (d: Date) => d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

      let startLabel = '';
      let endLabel = '';

      if (soldTrackerTimeframe === 'day') {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);
        startTs = start.getTime();
        endTs = end.getTime();
        startLabel = formatLocalDate(start);
        endLabel = formatLocalDate(end);
      } 
      else if (soldTrackerTimeframe === 'week') {
        const monday = getMonday(now);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        startTs = monday.getTime();
        endTs = sunday.getTime();
        startLabel = formatLocalDate(monday);
        endLabel = formatLocalDate(sunday);
      } 
      else if (soldTrackerTimeframe === 'month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        startTs = start.getTime();
        endTs = end.getTime();
        startLabel = formatLocalDate(start);
        endLabel = formatLocalDate(end);
      } 
      else if (soldTrackerTimeframe === 'year') {
        const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        startTs = start.getTime();
        endTs = end.getTime();
        startLabel = formatLocalDate(start);
        endLabel = formatLocalDate(end);
      } 
      else if (soldTrackerTimeframe === 'fiscal_year') {
        const fyMonthIndex = fiscalStartMonth - 1;
        const fyDay = fiscalStartDay;

        let fyStartYear = now.getFullYear();
        const thisYearFiscalStart = new Date(fyStartYear, fyMonthIndex, fyDay, 0, 0, 0, 0);
        if (now < thisYearFiscalStart) {
          fyStartYear -= 1;
        }

        const start = new Date(fyStartYear, fyMonthIndex, fyDay, 0, 0, 0, 0);
        const end = new Date(fyStartYear + 1, fyMonthIndex, fyDay, 0, 0, 0, 0);
        end.setTime(end.getTime() - 1);

        startTs = start.getTime();
        endTs = end.getTime();
        startLabel = formatLocalDate(start);
        endLabel = formatLocalDate(end);
      } 
      else if (soldTrackerTimeframe === 'quarter') {
        const q = Math.floor(now.getMonth() / 3);
        const startMonth = q * 3;
        const start = new Date(now.getFullYear(), startMonth, 1, 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), startMonth + 3, 0, 23, 59, 59, 999);
        startTs = start.getTime();
        endTs = end.getTime();
        startLabel = `Q${q + 1} (${formatLocalDate(start)}`;
        endLabel = `${formatLocalDate(end)})`;
      } 
      else if (soldTrackerTimeframe === 'custom_quarter') {
        const offset = customQuarterStartMonth - 1;
        const currentMonthNormalized = (now.getMonth() - offset + 12) % 12;
        const q = Math.floor(currentMonthNormalized / 3);
        
        let qStartMonth = offset + q * 3;
        let qStartYear = now.getFullYear();
        if (qStartMonth >= 12) {
          qStartMonth %= 12;
        }
        if (now.getMonth() < offset) {
          qStartYear -= 1;
        }
        
        const start = new Date(qStartYear, qStartMonth, 1, 0, 0, 0, 0);
        const end = new Date(qStartYear, qStartMonth + 3, 0, 23, 59, 59, 999);
        startTs = start.getTime();
        endTs = end.getTime();
        startLabel = `Custom Q${q + 1} (${formatLocalDate(start)}`;
        endLabel = `${formatLocalDate(end)})`;
      } 
      else if (soldTrackerTimeframe === 'custom_range') {
        const start = new Date(soldRangeStart + 'T00:00:00');
        const end = new Date(soldRangeEnd + 'T23:59:59');
        startTs = start.getTime();
        endTs = end.getTime();
        startLabel = formatLocalDate(start);
        endLabel = formatLocalDate(end);
      }

      // Find leads marked as sold in this period
      const soldLeadsMap = new Map<string, Lead>();
      allLeads.filter(l => l.status === 'sold' && (l.dealValue || 0) > 0).forEach(l => {
        soldLeadsMap.set(l.id, l);
      });

      const matchedSales: { leadName: string; address: string; date: number; value: number }[] = [];

      soldLeadsMap.forEach(lead => {
        const soldVisit = allVisits.find(v => v.leadId === lead.id && v.outcome === 'sold');
        const soldCall = allCalls.find(c => c.leadId === lead.id && c.outcome === 'sold');
        
        let soldTime = lead.addedAt;
        if (soldVisit && soldCall) {
          soldTime = Math.min(soldVisit.timestamp, soldCall.timestamp);
        } else if (soldVisit) {
          soldTime = soldVisit.timestamp;
        } else if (soldCall) {
          soldTime = soldCall.timestamp;
        }

        if (soldTime >= startTs && soldTime <= endTs) {
          matchedSales.push({
            leadName: lead.name,
            address: lead.address,
            date: soldTime,
            value: lead.dealValue || 0
          });
        }
      });

      matchedSales.sort((a, b) => b.date - a.date);

      const totalDeals = matchedSales.length;
      const totalRevenue = matchedSales.reduce((acc, curr) => acc + curr.value, 0);
      const avgDealValue = totalDeals > 0 ? Math.round(totalRevenue / totalDeals) : 0;

      setSoldPerformanceMetrics({
        totalDeals,
        totalRevenue,
        avgDealValue,
        soldLeadsList: matchedSales,
        startDateLabel: startLabel,
        endDateLabel: endLabel
      });

    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    calculateSoldPerformance();
  }, [
    soldTrackerTimeframe,
    fiscalStartMonth,
    fiscalStartDay,
    customQuarterStartMonth,
    soldRangeStart,
    soldRangeEnd
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <h2 style={{ fontFamily: 'Outfit', fontSize: '1.5rem' }}>Settings & Configurations</h2>

      {/* 1. General Profile Panel */}
      <form onSubmit={handleSaveProfile} className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid hsl(var(--border-muted))', paddingBottom: '0.5rem' }}>
          <Briefcase style={{ width: '18px', height: '18px', color: 'hsl(var(--primary))' }} />
          <span style={{ fontFamily: 'Outfit', fontWeight: 600 }}>Representative Profile</span>
        </div>

        <div className="form-group">
          <label>Sales Representative Name</label>
          <input 
            type="text" 
            className="form-control" 
            required
            value={repName}
            onChange={(e) => setRepName(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Prospect Search Radius ({searchRadius} km)</label>
          <input 
            type="range" 
            min={5} 
            max={50} 
            step={5}
            style={{ accentColor: 'hsl(var(--primary))', cursor: 'pointer' }}
            value={searchRadius}
            onChange={(e) => setSearchRadius(parseInt(e.target.value, 10))}
          />
        </div>

        <div className="form-group">
          <label style={{ marginBottom: '0.4rem' }}>Target Industries (Uniform Services Fit)</label>
          <div className="category-checklist">
            {INDUSTRY_CATEGORIES.map(category => (
              <div 
                key={category.id} 
                className={`category-card ${activeIndustries.includes(category.id) ? 'active' : ''}`}
                onClick={() => handleToggleIndustry(category.id)}
              >
                <div style={{ 
                  width: '14px', 
                  height: '14px', 
                  borderRadius: '3px', 
                  border: '1px solid hsl(var(--border-muted))', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  background: activeIndustries.includes(category.id) ? 'hsl(var(--primary))' : 'transparent'
                }}>
                  {activeIndustries.includes(category.id) && <Check style={{ width: '10px', height: '10px', stroke: '#fff' }} />}
                </div>
                <span>{category.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: '1px solid hsl(var(--border-muted))', paddingTop: '0.85rem', marginTop: '0.4rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'hsl(var(--secondary))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Career Milestones & Quotas Setup
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            <div className="form-group">
              <label>Fiscal Year Start Date</label>
              <input 
                type="date" 
                className="form-control"
                required
                value={fiscalYearStart}
                onChange={(e) => setFiscalYearStart(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Quarterly Summit Target ($)</label>
              <input 
                type="number" 
                className="form-control"
                min={0}
                required
                value={quarterlySummitTarget}
                onChange={(e) => setQuarterlySummitTarget(Number(e.target.value) || 0)}
              />
            </div>
            <div className="form-group">
              <label>Quarterly Presidents Club Target ($)</label>
              <input 
                type="number" 
                className="form-control"
                min={0}
                required
                value={quarterlyPresidentsClubTarget}
                onChange={(e) => setQuarterlyPresidentsClubTarget(Number(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>

        <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-start' }}>
          <Save style={{ width: '16px', height: '16px' }} />
          Save Profile
        </button>
      </form>

      {/* 2. Weekly Targets Planner */}
      {weeklyPlan && (
        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid hsl(var(--border-muted))', paddingBottom: '0.5rem' }}>
            <Calendar style={{ width: '18px', height: '18px', color: 'hsl(var(--success))' }} />
            <span style={{ fontFamily: 'Outfit', fontWeight: 600 }}>Weekly Planning Targets</span>
            <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginLeft: 'auto' }}>Week {weeklyPlan.id.split('-W')[1]}</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="planner-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>On-Site Target</th>
                  <th>Calls Target</th>
                  <th>Appts Target</th>
                  <th>Revenue Target ($)</th>
                </tr>
              </thead>
              <tbody>
                {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const).map(day => (
                  <tr key={day}>
                    <td style={{ textTransform: 'capitalize', fontSize: '0.82rem', fontWeight: 500 }}>{day.substring(0, 3)}</td>
                    <td>
                      <input 
                        type="number" 
                        min={0}
                        value={weeklyPlan.targets[day]?.osv ?? 0}
                        onChange={(e) => handleUpdateTarget(day, 'osv', parseInt(e.target.value, 10))}
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        min={0}
                        value={weeklyPlan.targets[day]?.calls ?? 0}
                        onChange={(e) => handleUpdateTarget(day, 'calls', parseInt(e.target.value, 10))}
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        min={0}
                        value={weeklyPlan.targets[day]?.appointments ?? 0}
                        onChange={(e) => handleUpdateTarget(day, 'appointments', parseInt(e.target.value, 10))}
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        min={0}
                        value={weeklyPlan.targets[day]?.revenue ?? 0}
                        onChange={(e) => handleUpdateTarget(day, 'revenue', parseInt(e.target.value, 10))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={handleSavePlanner} className="btn-primary" style={{ alignSelf: 'flex-start' }}>
            <Save style={{ width: '16px', height: '16px' }} />
            Save Weekly Targets
          </button>
        </div>
      )}

      {/* 3. Sold Performance Tracker Panel */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid hsl(var(--border-muted))', paddingBottom: '0.5rem' }}>
          <TrendingUp style={{ width: '18px', height: '18px', color: 'hsl(var(--success))' }} />
          <span style={{ fontFamily: 'Outfit', fontWeight: 600 }}>Sold Revenue Performance Tracker</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          {/* Timeframe Select */}
          <div className="form-group">
            <label>Performance Timeframe</label>
            <select
              className="form-control"
              value={soldTrackerTimeframe}
              onChange={(e: any) => setSoldTrackerTimeframe(e.target.value)}
            >
              <option value="day">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="quarter">This Calendar Quarter</option>
              <option value="custom_quarter">Custom Fiscal Quarter</option>
              <option value="year">This Calendar Year</option>
              <option value="fiscal_year">Custom Fiscal Year</option>
              <option value="custom_range">Custom Date Range</option>
            </select>
          </div>

          {/* Conditional Inputs */}
          {soldTrackerTimeframe === 'fiscal_year' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div className="form-group">
                <label>FY Start Month</label>
                <select
                  className="form-control"
                  value={fiscalStartMonth}
                  onChange={(e: any) => setFiscalStartMonth(parseInt(e.target.value, 10))}
                >
                  <option value={1}>January</option>
                  <option value={2}>February</option>
                  <option value={3}>March</option>
                  <option value={4}>April</option>
                  <option value={5}>May</option>
                  <option value={6}>June</option>
                  <option value={7}>July</option>
                  <option value={8}>August</option>
                  <option value={9}>September</option>
                  <option value={10}>October</option>
                  <option value={11}>November</option>
                  <option value={12}>December</option>
                </select>
              </div>
              <div className="form-group">
                <label>FY Start Day</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className="form-control"
                  value={fiscalStartDay}
                  onChange={(e: any) => setFiscalStartDay(parseInt(e.target.value, 10) || 1)}
                />
              </div>
            </div>
          )}

          {soldTrackerTimeframe === 'custom_quarter' && (
            <div className="form-group">
              <label>Q1 Start Month</label>
              <select
                className="form-control"
                value={customQuarterStartMonth}
                onChange={(e: any) => setCustomQuarterStartMonth(parseInt(e.target.value, 10))}
              >
                <option value={1}>January (Standard)</option>
                <option value={2}>February</option>
                <option value={3}>March</option>
                <option value={4}>April</option>
                <option value={5}>May</option>
                <option value={6}>June</option>
                <option value={7}>July</option>
                <option value={8}>August</option>
                <option value={9}>September</option>
                <option value={10}>October</option>
                <option value={11}>November</option>
                <option value={12}>December</option>
              </select>
            </div>
          )}

          {soldTrackerTimeframe === 'custom_range' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', gridColumn: '1 / -1' }}>
              <div className="form-group">
                <label>Start Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={soldRangeStart}
                  onChange={(e: any) => setSoldRangeStart(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>End Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={soldRangeEnd}
                  onChange={(e: any) => setSoldRangeEnd(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {soldPerformanceMetrics && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', fontWeight: 600 }}>
              PERIOD: {soldPerformanceMetrics.startDateLabel} — {soldPerformanceMetrics.endDateLabel}
            </span>

            {/* KPI Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
              <div className="stat-card osv" style={{ background: 'hsl(var(--success-glow))', border: '1px solid hsl(var(--success)/0.3)' }}>
                <span className="stat-val" style={{ color: 'hsl(var(--success))' }}>${soldPerformanceMetrics.totalRevenue.toLocaleString()}</span>
                <span className="stat-lbl" style={{ color: 'hsl(var(--success))' }}>Total Revenue</span>
              </div>
              <div className="stat-card appt">
                <span className="stat-val">{soldPerformanceMetrics.totalDeals}</span>
                <span className="stat-lbl">Accounts Closed</span>
              </div>
              <div className="stat-card pb" style={{ background: 'hsla(var(--bg-tertiary)/0.4)' }}>
                <span className="stat-val" style={{ color: 'hsl(var(--secondary))' }}>${soldPerformanceMetrics.avgDealValue.toLocaleString()}</span>
                <span className="stat-lbl">Avg. Deal Value</span>
              </div>
            </div>

            {/* List of Closed deals during period */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'hsl(var(--text-secondary))' }}>
                CLOSED ACCOUNTS LIST ({soldPerformanceMetrics.soldLeadsList.length})
              </span>

              <div className="glass-panel" style={{ maxHeight: '180px', overflowY: 'auto', padding: '0.5rem' }}>
                {soldPerformanceMetrics.soldLeadsList.length === 0 ? (
                  <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', textAlign: 'center', padding: '1rem' }}>
                    No sales closed during this timeframe.
                  </p>
                ) : (
                  soldPerformanceMetrics.soldLeadsList.map((deal, idx) => (
                    <div key={idx} style={{ fontSize: '0.78rem', borderBottom: '1px dashed hsl(var(--border-muted))', padding: '0.5rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, color: 'hsl(var(--text-primary))' }}>{deal.leadName}</span>
                        <span style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))' }}>📍 {deal.address}</span>
                        <span style={{ fontSize: '0.70rem', color: 'hsl(var(--text-muted))' }}>Sold Date: {new Date(deal.date).toLocaleDateString()}</span>
                      </div>
                      <span style={{ fontWeight: 700, color: 'hsl(var(--success))', fontSize: '0.9rem' }}>
                        +${deal.value.toLocaleString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Activity Reports Generator Panel */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid hsl(var(--border-muted))', paddingBottom: '0.5rem' }}>
          <BarChart3 style={{ width: '18px', height: '18px', color: 'hsl(var(--primary))' }} />
          <span style={{ fontFamily: 'Outfit', fontWeight: 600 }}>Activity Reports Generator</span>
        </div>

        <form onSubmit={handleGenerateReport} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div className="form-group">
            <label>Start Date</label>
            <input 
              type="date" 
              required
              className="form-control"
              value={reportStart}
              onChange={(e) => setReportStart(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>End Date</label>
            <input 
              type="date" 
              required
              className="form-control"
              value={reportEnd}
              onChange={(e) => setReportEnd(e.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary">
            <BarChart3 style={{ width: '15px', height: '15px' }} />
            Generate Report
          </button>
        </form>

        {reportStats && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '0.5rem' }}>
            {/* KPI grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.75rem' }}>
              <div className="stat-card osv">
                <span className="stat-val">{reportStats.totalOsv}</span>
                <span className="stat-lbl">Total OSVs</span>
              </div>
              <div className="stat-card pb">
                <span className="stat-val">{reportStats.totalCalls}</span>
                <span className="stat-lbl">Total Calls</span>
              </div>
              <div className="stat-card appt">
                <span className="stat-val">{reportStats.totalAppts}</span>
                <span className="stat-lbl">Appointments</span>
              </div>
              <div className="stat-card" style={{ background: 'hsla(var(--bg-tertiary)/0.4)' }}>
                <span className="stat-val" style={{ color: 'hsl(var(--secondary))' }}>{reportStats.activeDays}</span>
                <span className="stat-lbl">Active Days</span>
              </div>
            </div>

            {/* Averages list */}
            <div className="glass-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                <span style={{ fontWeight: 700, color: 'hsl(var(--text-muted))', fontSize: '0.75rem' }}>DAILY AVERAGES (ACTIVE DAYS)</span>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>🚶 OSVs / Active Day:</span>
                  <span style={{ fontWeight: 600 }}>{reportStats.avgOsvPerActiveDay}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>📞 Calls / Active Day:</span>
                  <span style={{ fontWeight: 600 }}>{reportStats.avgCallsPerActiveDay}</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                <span style={{ fontWeight: 700, color: 'hsl(var(--text-muted))', fontSize: '0.75rem' }}>WEEKLY CALENDAR AVERAGES</span>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>🚶 OSVs / Week:</span>
                  <span style={{ fontWeight: 600 }}>{reportStats.avgOsvPerWeek}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>📞 Calls / Week:</span>
                  <span style={{ fontWeight: 600 }}>{reportStats.avgCallsPerWeek}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>🤝 Appts / Week:</span>
                  <span style={{ fontWeight: 600 }}>{reportStats.avgApptsPerWeek}</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem', gridColumn: '1 / -1', borderTop: '1px solid hsl(var(--border-muted))', paddingTop: '0.75rem' }}>
                <span style={{ fontWeight: 700, color: 'hsl(var(--text-muted))', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <TrendingUp style={{ width: '13px', height: '13px' }} /> FUNNEL CONVERSIONS
                </span>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>🚶 OSV to Direct Appointment rate:</span>
                  <span style={{ fontWeight: 600, color: 'hsl(var(--success))' }}>{reportStats.osvToApptRate}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>📞 Cold Call to Appointment rate:</span>
                  <span style={{ fontWeight: 600, color: 'hsl(var(--success))' }}>{reportStats.callToApptRate}%</span>
                </div>
              </div>
            </div>

            {/* List of activities and export */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'space-between', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'hsl(var(--text-secondary))' }}>DETAILED LOGS ({reportActivities.length})</span>
                <button type="button" className="btn-secondary" onClick={handleExportCSV} style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', gap: '0.3rem' }}>
                  <FileSpreadsheet style={{ width: '14px', height: '14px' }} />
                  Export CSV
                </button>
              </div>

              <div className="glass-panel" style={{ maxHeight: '180px', overflowY: 'auto', padding: '0.5rem' }}>
                {reportActivities.length === 0 ? (
                  <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', textAlign: 'center', padding: '1rem' }}>No activity in date range.</p>
                ) : (
                  reportActivities.map((act, index) => (
                    <div key={index} style={{ fontSize: '0.78rem', borderBottom: '1px dashed hsl(var(--border-muted))', padding: '0.5rem 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 500, color: 'hsl(var(--text-secondary))' }}>
                        <span>{act.type} • {act.leadName}</span>
                        <span style={{ color: 'hsl(var(--text-muted))' }}>{new Date(act.timestamp).toLocaleDateString()}</span>
                      </div>
                      <p style={{ color: 'hsl(var(--text-muted))', marginTop: '0.1rem' }}>
                        <strong>Outcome:</strong> {act.outcome} • <strong>Contact:</strong> {act.spokeWith}
                      </p>
                      {act.notes && <p style={{ color: 'hsl(var(--text-secondary))', fontStyle: 'italic', marginTop: '0.1rem' }}>"{act.notes}"</p>}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Developer / Simulated Location Panel */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid hsl(var(--border-muted))', paddingBottom: '0.5rem' }}>
          <Compass style={{ width: '18px', height: '18px', color: 'hsl(var(--secondary))' }} />
          <span style={{ fontFamily: 'Outfit', fontWeight: 600 }}>Location Simulation</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {presets.map(p => (
            <button 
              key={p.name}
              type="button"
              className="filter-tab"
              onClick={() => handlePresetSelect(p.lat, p.lng)}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group">
            <label>Latitude</label>
            <input 
              type="text" 
              className="form-control"
              value={simLat}
              onChange={(e) => setSimLat(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Longitude</label>
            <input 
              type="text" 
              className="form-control"
              value={simLng}
              onChange={(e) => setSimLng(e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn-primary" onClick={handleSimClick}>
            <MapPin style={{ width: '16px', height: '16px' }} />
            Simulate Coordinates
          </button>
          
          {isLocationSimulated && (
            <button type="button" className="btn-secondary" onClick={onResetLocation}>
              Reset to GPS
            </button>
          )}
        </div>
        
        {isLocationSimulated && (
          <span style={{ fontSize: '0.74rem', color: 'hsl(var(--warning))' }}>
            ⚠️ Coordinates are currently simulated. Real GPS updates are suspended.
          </span>
        )}
      </div>

      {/* 6. Local DB Management Panel */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid hsl(var(--border-muted))', paddingBottom: '0.5rem' }}>
          <Trash2 style={{ width: '18px', height: '18px', color: 'hsl(var(--danger))' }} />
          <span style={{ fontFamily: 'Outfit', fontWeight: 600 }}>System Tools</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button type="button" className="btn-secondary" onClick={handleExportDB} style={{ gap: '0.4rem' }}>
            <Download style={{ width: '15px', height: '15px' }} />
            Export Data Backup
          </button>

          <button type="button" className="btn-danger" onClick={handleClearDB}>
            Permanently Reset Database
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
