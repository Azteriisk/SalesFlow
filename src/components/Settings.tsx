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
  Briefcase,
  Plus,
  Edit3,
  RotateCcw,
  RefreshCw,
  Phone
} from 'lucide-react';
import { 
  dbService, 
  getWeekId,
  getMonday
} from '../services/db';
import type { Profile, WeeklyPlan, Lead } from '../services/db';
import { INDUSTRY_CATEGORIES } from '../services/places';
import type { TargetCategory } from '../services/places';
import { generateAISuggestions } from '../services/aiSuggestions';
import { requestNotificationPermission } from '../services/notifications';
import { syncDataWithCloud, getLastSyncedTime } from '../services/sync';
import { useUser } from '../services/clerk';

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
  const { user } = useUser();
  const [repName, setRepName] = useState<string>(profile.repName);
  const [searchRadius, setSearchRadius] = useState<number>(profile.searchRadiusKm);
  const [activeIndustries, setActiveIndustries] = useState<string[]>(profile.industryFilters);
  const [soundEffectsEnabled, setSoundEffectsEnabled] = useState<boolean>(profile.soundEffectsEnabled ?? true);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(profile.notificationsEnabled ?? false);
  const [appointmentRemindersEnabled, setAppointmentRemindersEnabled] = useState<boolean>(profile.appointmentRemindersEnabled ?? true);
  const [motivationRemindersEnabled, setMotivationRemindersEnabled] = useState<boolean>(profile.motivationRemindersEnabled ?? true);
  const [jobType, setJobType] = useState<string>(profile.jobType || 'General Commercial Representative');
  const [companyName, setCompanyName] = useState<string>(profile.companyName || '');
  const [callingScript, setCallingScript] = useState<string>(profile.callingScript || '');
  const [aiSuggestions, setAiSuggestions] = useState<TargetCategory[]>([]);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState<boolean>(false);
  
  const [categories, setCategories] = useState<TargetCategory[]>(profile.categories || INDUSTRY_CATEGORIES);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState<string>('');
  const [editQuery, setEditQuery] = useState<string>('');
  const [newLabel, setNewLabel] = useState<string>('');
  const [newQuery, setNewQuery] = useState<string>('');
  const [isAddingCategory, setIsAddingCategory] = useState<boolean>(false);
  
  // Sync status
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [lastSynced, setLastSynced] = useState<string>(getLastSyncedTime());

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

  const [targetsLocked, setTargetsLocked] = useState<boolean>(false);

  useEffect(() => {
    const loadPlanAndOrg = async () => {
      let plan = await dbService.getWeeklyPlan(currentWeekId);
      
      if (profile.organizationId) {
        const org = await dbService.getOrganization(profile.organizationId);
        if (org) {
          
          // Check if this plan has not been manually edited/saved yet
          const isNewPlan = !localStorage.getItem(`weekly_plan_saved_${currentWeekId}`);
          if (isNewPlan) {
            const defaultTargets = {
              osv: org.defaultTargets.osv,
              calls: org.defaultTargets.calls,
              appointments: org.defaultTargets.appointments ?? 2,
              revenue: org.defaultTargets.revenue ?? 500
            };
            plan = {
              ...plan,
              targets: {
                monday: defaultTargets,
                tuesday: defaultTargets,
                wednesday: defaultTargets,
                thursday: defaultTargets,
                friday: defaultTargets,
                saturday: { osv: 0, calls: 0, appointments: 0, revenue: 0 },
                sunday: { osv: 0, calls: 0, appointments: 0, revenue: 0 }
              }
            };
            await dbService.saveWeeklyPlan(plan);
          }
        }
      }
      
      setWeeklyPlan(plan);
      setTargetsLocked(false); // Enable manual quota editing at all times
    };
    loadPlanAndOrg();
  }, [currentWeekId, profile.organizationId]);

  useEffect(() => {
    setSimLat(location.latitude.toFixed(6));
    setSimLng(location.longitude.toFixed(6));
  }, [location]);

  const handleTriggerAISuggestions = () => {
    if (!jobType.trim()) {
      alert('Please enter a Job Title to generate suggestions.');
      return;
    }
    setIsGeneratingSuggestions(true);
    setAiSuggestions([]);
    
    // Simulate premium AI computation delay of 1.5s
    setTimeout(() => {
      const suggestions = generateAISuggestions(jobType, companyName);
      setAiSuggestions(suggestions);
      setIsGeneratingSuggestions(false);
    }, 1500);
  };

  const handleAddSuggestedTarget = (suggestion: TargetCategory) => {
    const newId = `custom_ai_${Date.now()}`;
    const newCat: TargetCategory = {
      id: newId,
      label: suggestion.label,
      query: suggestion.query,
      isCustom: true
    };
    
    if (categories.some(c => c.label.toLowerCase() === suggestion.label.toLowerCase())) {
      alert(`A target category named "${suggestion.label}" is already in your list.`);
      return;
    }

    const updatedCats = [...categories, newCat];
    setCategories(updatedCats);
    
    const updatedFilters = [...activeIndustries, newId];
    setActiveIndustries(updatedFilters);
    
    const updated: Profile = {
      ...profile,
      categories: updatedCats,
      industryFilters: updatedFilters
    };
    onProfileUpdate(updated);

    // Remove from suggestions
    setAiSuggestions(aiSuggestions.filter(s => s.id !== suggestion.id));
  };

  const handleAddCategory = () => {
    if (!newLabel.trim() || !newQuery.trim()) {
      alert('Please fill out both the category label and search keywords.');
      return;
    }
    const newId = `custom_${Date.now()}`;
    const newCat: TargetCategory = {
      id: newId,
      label: newLabel.trim(),
      query: newQuery.trim(),
      isCustom: true
    };
    const updatedCats = [...categories, newCat];
    setCategories(updatedCats);
    
    // Automatically enable it in active industries
    const updatedFilters = [...activeIndustries, newId];
    setActiveIndustries(updatedFilters);
    
    // Reset form
    setNewLabel('');
    setNewQuery('');
    setIsAddingCategory(false);
    
    // Save to DB immediately so changes persist
    const updated: Profile = {
      ...profile,
      categories: updatedCats,
      industryFilters: updatedFilters
    };
    onProfileUpdate(updated);
  };

  const handleStartEdit = (cat: TargetCategory) => {
    setEditingCategoryId(cat.id);
    setEditLabel(cat.label);
    setEditQuery(cat.query);
  };

  const handleSaveEdit = (id: string) => {
    if (!editLabel.trim() || !editQuery.trim()) {
      alert('Please fill out both the label and search keywords.');
      return;
    }
    const updatedCats = categories.map(cat => {
      if (cat.id === id) {
        return { ...cat, label: editLabel.trim(), query: editQuery.trim() };
      }
      return cat;
    });
    setCategories(updatedCats);
    setEditingCategoryId(null);
    
    // Save to DB immediately
    const updated: Profile = {
      ...profile,
      categories: updatedCats
    };
    onProfileUpdate(updated);
  };

  const handleDeleteCategory = (id: string) => {
    if (confirm('Are you sure you want to delete this custom category?')) {
      const updatedCats = categories.filter(cat => cat.id !== id);
      setCategories(updatedCats);
      const updatedFilters = activeIndustries.filter(item => item !== id);
      setActiveIndustries(updatedFilters);
      
      // Save to DB immediately
      const updated: Profile = {
        ...profile,
        categories: updatedCats,
        industryFilters: updatedFilters
      };
      onProfileUpdate(updated);
    }
  };

  const handleResetDefaultCategory = (id: string) => {
    const original = INDUSTRY_CATEGORIES.find(c => c.id === id);
    if (original) {
      const updatedCats = categories.map(cat => {
        if (cat.id === id) {
          return { ...cat, label: original.label, query: original.query };
        }
        return cat;
      });
      setCategories(updatedCats);
      
      // Save to DB immediately
      const updated: Profile = {
        ...profile,
        categories: updatedCats
      };
      onProfileUpdate(updated);
      alert(`Reset "${original.label}" category to its original settings.`);
    }
  };

  const handleApplyCompanyDefaults = async () => {
    if (!profile.organizationId || !weeklyPlan) return;
    try {
      const org = await dbService.getOrganization(profile.organizationId);
      if (org) {
        const companyTargets = {
          osv: org.defaultTargets.osv,
          calls: org.defaultTargets.calls,
          appointments: org.defaultTargets.appointments ?? 2,
          revenue: org.defaultTargets.revenue ?? 500
        };
        const updatedPlan = {
          ...weeklyPlan,
          targets: {
            monday: companyTargets,
            tuesday: companyTargets,
            wednesday: companyTargets,
            thursday: companyTargets,
            friday: companyTargets,
            saturday: { osv: 0, calls: 0, appointments: 0, revenue: 0 },
            sunday: { osv: 0, calls: 0, appointments: 0, revenue: 0 }
          }
        };
        setWeeklyPlan(updatedPlan);
        await dbService.saveWeeklyPlan(updatedPlan);
        alert('Weekly targets reset to company defaults.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to apply company defaults.');
    }
  };

  const handleApplyCompanyIndustries = async () => {
    if (!profile.organizationId) return;
    try {
      const org = await dbService.getOrganization(profile.organizationId);
      if (org && org.defaultIndustries) {
        setActiveIndustries(org.defaultIndustries);
        alert('Target industries reset to company defaults.');
      } else {
        alert('No default industries set by the company.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to apply company default industries.');
    }
  };

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
      quarterlyPresidentsClubTarget: Number(quarterlyPresidentsClubTarget),
      soundEffectsEnabled,
      notificationsEnabled,
      appointmentRemindersEnabled,
      motivationRemindersEnabled,
      jobType,
      companyName,
      categories,
      callingScript
    };
    onProfileUpdate(updated);
    alert('Profile settings saved successfully.');
  };

  const handleDeleteAccount = async () => {
    const confirmDelete = window.confirm(
      "WARNING: This will permanently delete your account, your organization associations, and wipe all local offline data from this device. This cannot be undone.\n\nAre you sure you want to proceed?"
    );
    if (!confirmDelete) return;

    try {
      await dbService.clearAllData();
      
      if (user) {
        await user.delete();
        alert("Your account has been deleted successfully.");
      } else {
        alert("Local data wiped. Mock account cleared.");
        window.location.reload();
      }
    } catch (err: any) {
      console.error("Account deletion failed:", err);
      alert(`Failed to delete account: ${err.message || 'Unknown error'}`);
    }
  };

  const handleToggleNotifications = async (checked: boolean) => {
    if (checked) {
      const granted = await requestNotificationPermission();
      setNotificationsEnabled(granted);
      if (!granted) {
        alert('Notification permission was denied by the browser. Please enable them in your browser site settings.');
      }
    } else {
      setNotificationsEnabled(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncStatus('syncing');
    const result = await syncDataWithCloud();
    if (result.success) {
      setSyncStatus('success');
      setLastSynced(getLastSyncedTime());
      if (result.pulledCount > 0) {
        alert(`Cloud synchronization complete! Pulled ${result.pulledCount} updates from other team members on shared accounts.`);
      } else {
        alert('Cloud synchronization complete! All offline logs are fully up to date.');
      }
    } else {
      setSyncStatus('error');
      alert('Synchronization failed. Please check network connectivity.');
    }
    setTimeout(() => setSyncStatus('idle'), 3000);
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
      localStorage.setItem(`weekly_plan_saved_${currentWeekId}`, 'true');
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '0.4rem' }}>
          <div className="form-group">
            <label style={{ marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Briefcase style={{ width: '15px', height: '15px', color: 'hsl(var(--primary))' }} />
              Job Title
            </label>
            <input 
              type="text" 
              value={jobType} 
              onChange={(e) => setJobType(e.target.value)}
              placeholder="e.g. Uniform Sales Rep, Medical Devices"
              className="form-control"
              style={{ background: 'hsl(var(--bg-primary))', border: '1px solid hsl(var(--border-muted))', borderRadius: '8px', color: 'hsl(var(--text-primary))', padding: '0.5rem', width: '100%', outline: 'none' }}
            />
          </div>

          <div className="form-group">
            <label style={{ marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Compass style={{ width: '15px', height: '15px', color: 'hsl(var(--primary))' }} />
              Company Name
            </label>
            <input 
              type="text" 
              value={companyName} 
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Cintas, UniFirst"
              className="form-control"
              style={{ background: 'hsl(var(--bg-primary))', border: '1px solid hsl(var(--border-muted))', borderRadius: '8px', color: 'hsl(var(--text-primary))', padding: '0.5rem', width: '100%', outline: 'none' }}
            />
          </div>
        </div>

        {/* AI Recommendations Panel */}
        <div style={{ 
          background: 'linear-gradient(135deg, hsla(var(--primary-glow) / 0.1) 0%, hsla(var(--secondary) / 0.05) 100%)',
          border: '1px solid hsla(var(--primary) / 0.25)', 
          borderRadius: '12px', 
          padding: '0.85rem', 
          marginBottom: '1rem',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'hsl(var(--text-primary))', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                ✨ AI Target Recommendations
              </div>
              <div style={{ fontSize: '0.74rem', color: 'hsl(var(--text-muted))', marginTop: '0.1rem' }}>
                Generate custom target suggestions matching your specific role and company profile.
              </div>
            </div>
            <button
              type="button"
              onClick={handleTriggerAISuggestions}
              disabled={isGeneratingSuggestions}
              style={{
                background: 'linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.78rem',
                padding: '0.45rem 0.9rem',
                cursor: 'pointer',
                opacity: isGeneratingSuggestions ? 0.7 : 1,
                boxShadow: '0 4px 12px hsla(var(--primary) / 0.2)',
                transition: 'transform 0.2s'
              }}
            >
              {isGeneratingSuggestions ? 'AI is Thinking...' : 'Generate Suggestions'}
            </button>
          </div>

          {isGeneratingSuggestions && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0', color: 'hsl(var(--secondary))', fontSize: '0.78rem' }}>
              <RefreshCw className="animate-spin" style={{ width: '14px', height: '14px', animation: 'spin 1.5s linear infinite' }} />
              <span>AI is analyzing your role and company target profile...</span>
            </div>
          )}

          {aiSuggestions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.6rem', borderTop: '1px solid hsla(var(--primary) / 0.15)', paddingTop: '0.6rem' }}>
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700, color: 'hsl(var(--text-secondary))', letterSpacing: '0.05em' }}>
                AI Suggested Targets
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.4rem' }}>
                {aiSuggestions.map((suggestion) => (
                  <div 
                    key={suggestion.id}
                    style={{
                      background: 'rgba(0,0,0,0.2)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '8px',
                      padding: '0.45rem 0.6rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.4rem'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {suggestion.label}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'hsl(var(--text-muted))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Keywords: {suggestion.query}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddSuggestedTarget(suggestion)}
                      style={{
                        background: 'hsla(var(--primary) / 0.25)',
                        border: '1px solid hsla(var(--primary) / 0.4)',
                        borderRadius: '6px',
                        color: 'hsl(var(--primary))',
                        fontWeight: 700,
                        fontSize: '0.7rem',
                        padding: '0.2rem 0.45rem',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      + Add
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <label style={{ margin: 0 }}>Target Industries ({jobType} Fit)</label>
            {profile.organizationId && (
              <button 
                type="button"
                onClick={handleApplyCompanyIndustries}
                style={{ background: 'transparent', border: 'none', color: 'hsl(var(--secondary))', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'underline' }}
              >
                Apply Company Defaults
              </button>
            )}
          </div>
          <div className="category-checklist">
            {categories.map(category => (
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

        <div className="form-group" style={{ borderTop: '1px solid hsl(var(--border-muted))', paddingTop: '1rem', marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <div>
              <label style={{ margin: 0, display: 'block', fontWeight: 600 }}>Target Query & Keyword Editor</label>
              <span style={{ fontSize: '0.74rem', color: 'hsl(var(--text-muted))' }}>
                Customize the names and Google Maps search keywords for your target sectors.
              </span>
            </div>
            {!isAddingCategory && (
              <button 
                type="button"
                onClick={() => setIsAddingCategory(true)}
                style={{ 
                  background: 'hsl(var(--primary))', 
                  border: 'none', 
                  borderRadius: '6px', 
                  color: '#fff', 
                  fontSize: '0.75rem', 
                  fontWeight: 600, 
                  padding: '0.4rem 0.75rem', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.25rem' 
                }}
              >
                <Plus style={{ width: '13px', height: '13px' }} /> Add Custom Target
              </button>
            )}
          </div>

          {/* Add Category Form */}
          {isAddingCategory && (
            <div style={{ 
              background: 'hsla(var(--bg-tertiary) / 0.3)', 
              border: '1px dashed hsl(var(--border-muted))', 
              borderRadius: '8px', 
              padding: '0.85rem', 
              marginBottom: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'hsl(var(--primary))' }}>New Custom Target Category</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.7rem', color: 'hsl(var(--text-secondary))' }}>Category Name / Label</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Pet Stores" 
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    style={{ background: 'hsl(var(--bg-primary))', border: '1px solid hsl(var(--border-muted))', borderRadius: '6px', padding: '0.4rem', color: '#fff', fontSize: '0.78rem', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.7rem', color: 'hsl(var(--text-secondary))' }}>Google Maps Search Keywords</label>
                  <input 
                    type="text" 
                    placeholder="e.g. pet store aquarium pet supplies" 
                    value={newQuery}
                    onChange={(e) => setNewQuery(e.target.value)}
                    style={{ background: 'hsl(var(--bg-primary))', border: '1px solid hsl(var(--border-muted))', borderRadius: '6px', padding: '0.4rem', color: '#fff', fontSize: '0.78rem', outline: 'none' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <button 
                  type="button" 
                  onClick={() => setIsAddingCategory(false)}
                  style={{ background: 'transparent', border: '1px solid hsl(var(--border-muted))', color: 'hsl(var(--text-secondary))', borderRadius: '4px', padding: '0.3rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={handleAddCategory}
                  style={{ background: 'hsl(var(--primary))', border: 'none', color: '#fff', borderRadius: '4px', padding: '0.3rem 0.6rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Add Category
                </button>
              </div>
            </div>
          )}

          {/* Categories List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '350px', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {categories.map(cat => {
              const originalCat = INDUSTRY_CATEGORIES.find(c => c.id === cat.id);
              const hasChanged = originalCat && (originalCat.label !== cat.label || originalCat.query !== cat.query);
              const isEditing = editingCategoryId === cat.id;

              return (
                <div 
                  key={cat.id} 
                  style={{ 
                    background: 'hsla(var(--bg-tertiary) / 0.2)', 
                    border: '1px solid hsl(var(--border-muted))', 
                    borderRadius: '8px', 
                    padding: '0.6rem 0.8rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem'
                  }}
                >
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <label style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>Label</label>
                          <input 
                            type="text" 
                            value={editLabel} 
                            onChange={(e) => setEditLabel(e.target.value)}
                            style={{ background: 'hsl(var(--bg-primary))', border: '1px solid hsl(var(--border-muted))', borderRadius: '6px', padding: '0.3rem', color: '#fff', fontSize: '0.75rem', outline: 'none' }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <label style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>Keywords</label>
                          <input 
                            type="text" 
                            value={editQuery} 
                            onChange={(e) => setEditQuery(e.target.value)}
                            style={{ background: 'hsl(var(--bg-primary))', border: '1px solid hsl(var(--border-muted))', borderRadius: '6px', padding: '0.3rem', color: '#fff', fontSize: '0.75rem', outline: 'none' }}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                        <button 
                          type="button" 
                          onClick={() => setEditingCategoryId(null)}
                          style={{ background: 'transparent', border: '1px solid hsl(var(--border-muted))', color: 'hsl(var(--text-secondary))', borderRadius: '4px', padding: '0.2rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                        <button 
                          type="button" 
                          onClick={() => handleSaveEdit(cat.id)}
                          style={{ background: 'hsl(var(--primary))', border: 'none', color: '#fff', borderRadius: '4px', padding: '0.2rem 0.5rem', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'hsl(var(--text-primary))' }}>
                            {cat.label}
                          </span>
                          {cat.isCustom ? (
                            <span style={{ fontSize: '0.62rem', background: 'hsl(var(--secondary) / 0.15)', color: 'hsl(var(--secondary))', border: '1px solid hsl(var(--secondary) / 0.3)', borderRadius: '4px', padding: '0.05rem 0.25rem' }}>
                              Custom
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.62rem', background: 'rgba(255, 255, 255, 0.05)', color: 'hsl(var(--text-muted))', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '4px', padding: '0.05rem 0.25rem' }}>
                              System
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))', fontFamily: 'monospace', background: 'rgba(0, 0, 0, 0.15)', padding: '0.15rem 0.3rem', borderRadius: '4px', marginTop: '0.15rem', display: 'inline-block' }}>
                          {cat.query}
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button 
                          type="button" 
                          onClick={() => handleStartEdit(cat)}
                          title="Edit Keywords"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid hsl(var(--border-muted))', color: 'hsl(var(--text-secondary))', borderRadius: '6px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        >
                          <Edit3 style={{ width: '13px', height: '13px', margin: 'auto' }} />
                        </button>
                        {cat.isCustom ? (
                          <button 
                            type="button" 
                            onClick={() => handleDeleteCategory(cat.id)}
                            title="Delete Target"
                            style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'hsl(0 84.2% 60.2%)', borderRadius: '6px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                          >
                            <Trash2 style={{ width: '13px', height: '13px', margin: 'auto' }} />
                          </button>
                        ) : (
                          hasChanged && (
                            <button 
                              type="button" 
                              onClick={() => handleResetDefaultCategory(cat.id)}
                              title="Reset to default query"
                              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid hsl(var(--border-muted))', color: 'hsl(var(--secondary))', borderRadius: '6px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            >
                              <RotateCcw style={{ width: '13px', height: '13px', margin: 'auto' }} />
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid hsl(var(--border-muted))', paddingTop: '0.85rem', marginTop: '0.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input 
              type="checkbox" 
              id="notifications"
              style={{ width: '16px', height: '16px', accentColor: 'hsl(var(--primary))', cursor: 'pointer' }}
              checked={notificationsEnabled}
              onChange={(e) => handleToggleNotifications(e.target.checked)}
            />
            <label htmlFor="notifications" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--text-primary))', cursor: 'pointer' }}>
              Enable Browser Notifications
            </label>
          </div>
          
          {notificationsEnabled && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '0.4rem', 
              paddingLeft: '1.5rem', 
              animation: 'scaleUp 0.2s ease-out' 
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input 
                  type="checkbox" 
                  id="apptReminders"
                  style={{ width: '14px', height: '14px', accentColor: 'hsl(var(--primary))', cursor: 'pointer' }}
                  checked={appointmentRemindersEnabled}
                  onChange={(e) => setAppointmentRemindersEnabled(e.target.checked)}
                />
                <label htmlFor="apptReminders" style={{ fontSize: '0.78rem', color: 'hsl(var(--text-secondary))', cursor: 'pointer' }}>
                  15-Minute Appointment Reminders
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input 
                  type="checkbox" 
                  id="motivationReminders"
                  style={{ width: '14px', height: '14px', accentColor: 'hsl(var(--primary))', cursor: 'pointer' }}
                  checked={motivationRemindersEnabled}
                  onChange={(e) => setMotivationRemindersEnabled(e.target.checked)}
                />
                <label htmlFor="motivationReminders" style={{ fontSize: '0.78rem', color: 'hsl(var(--text-secondary))', cursor: 'pointer' }}>
                  Daily OSV Goal EOD Motivation Alerts
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Calling Script Reference Textarea */}
        <div className="form-group" style={{ borderTop: '1px solid hsl(var(--border-muted))', paddingTop: '0.85rem' }}>
          <label style={{ marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>
            <Phone style={{ width: '15px', height: '15px', color: 'hsl(var(--primary))' }} />
            Cold Calling Script pad
          </label>
          <textarea 
            value={callingScript}
            onChange={(e) => setCallingScript(e.target.value)}
            placeholder="Write your phone script or pitch hook here... It will automatically show up as a collapsible reference helper card in the Phone Dialer block."
            className="form-control"
            rows={5}
            style={{ 
              background: 'hsl(var(--bg-primary))', 
              border: '1px solid hsl(var(--border-muted))', 
              borderRadius: '8px', 
              color: 'hsl(var(--text-primary))', 
              padding: '0.5rem 0.75rem', 
              width: '100%', 
              outline: 'none', 
              fontFamily: 'inherit', 
              fontSize: '0.82rem',
              resize: 'vertical'
            }}
          />
          <span style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))', marginTop: '0.2rem', display: 'block' }}>
            Keep your pitch hooks, qualifiers, or objection handling scripts here for quick offline reference when cold calling.
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderTop: '1px solid hsl(var(--border-muted))', paddingTop: '0.85rem', marginTop: '0.4rem' }}>
          <input 
            type="checkbox" 
            id="soundEffects"
            style={{ width: '16px', height: '16px', accentColor: 'hsl(var(--primary))', cursor: 'pointer' }}
            checked={soundEffectsEnabled}
            onChange={(e) => setSoundEffectsEnabled(e.target.checked)}
          />
          <label htmlFor="soundEffects" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--text-primary))', cursor: 'pointer' }}>
            Enable Sound Effects (Confetti, Goal Achievements, Swipes)
          </label>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
          <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Save style={{ width: '16px', height: '16px' }} />
            Save Profile
          </button>

          <button 
            type="button" 
            onClick={handleDeleteAccount} 
            className="btn-danger" 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.4rem', 
              background: 'transparent',
              border: '1px solid hsl(var(--error))',
              color: 'hsl(var(--error))',
              padding: '0.5rem 0.9rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              marginLeft: 'auto'
            }}
          >
            <Trash2 style={{ width: '15px', height: '15px' }} />
            Delete Account & Wipe Data
          </button>
        </div>
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
                        disabled={targetsLocked}
                        value={weeklyPlan.targets[day]?.osv ?? 0}
                        onChange={(e) => handleUpdateTarget(day, 'osv', parseInt(e.target.value, 10))}
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        min={0}
                        disabled={targetsLocked}
                        value={weeklyPlan.targets[day]?.calls ?? 0}
                        onChange={(e) => handleUpdateTarget(day, 'calls', parseInt(e.target.value, 10))}
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        min={0}
                        disabled={targetsLocked}
                        value={weeklyPlan.targets[day]?.appointments ?? 0}
                        onChange={(e) => handleUpdateTarget(day, 'appointments', parseInt(e.target.value, 10))}
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        min={0}
                        disabled={targetsLocked}
                        value={weeklyPlan.targets[day]?.revenue ?? 0}
                        onChange={(e) => handleUpdateTarget(day, 'revenue', parseInt(e.target.value, 10))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <button onClick={handleSavePlanner} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
              <Save style={{ width: '16px', height: '16px' }} />
              Save Weekly Targets
            </button>
            {profile.organizationId && (
              <button 
                onClick={handleApplyCompanyDefaults} 
                className="btn-secondary" 
                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', cursor: 'pointer' }}
              >
                Reset to Company Defaults
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. Cloud Sync Panel */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid hsl(var(--border-muted))', paddingBottom: '0.5rem' }}>
          <Briefcase style={{ width: '18px', height: '18px', color: 'hsl(var(--primary))' }} />
          <span style={{ fontFamily: 'Outfit', fontWeight: 600 }}>Cloud Data Synchronization</span>
          <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginLeft: 'auto' }}>
            Last Synced: {lastSynced}
          </span>
        </div>
        
        <p style={{ fontSize: '0.82rem', color: 'hsl(var(--text-secondary))', lineHeight: '1.4' }}>
          SalesFlow is fully offline-first. Syncing uploads your local visits, calls, and planner notes to the shared cloud database, and downloads updates from other team members working the same accounts.
        </p>

        <button 
          type="button" 
          className="btn-primary" 
          disabled={syncStatus === 'syncing'}
          onClick={handleSyncNow}
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <span>{syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}</span>
        </button>
      </div>

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
