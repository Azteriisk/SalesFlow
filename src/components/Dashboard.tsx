import React, { useEffect, useState, useRef } from 'react';
import { 
  MapPin, 
  Phone, 
  Calendar, 
  Map as MapIcon, 
  AlertCircle, 
  TrendingUp, 
  Activity,
  DollarSign,
  Award
} from 'lucide-react';
import { 
  dbService, 
  getWeekId 
} from '../services/db';
import type { Lead, WeeklyPlan, AchievementBadge } from '../services/db';
import { loadGoogleMapsScript } from '../services/places';
import TodoList from './TodoList';

interface DashboardProps {
  location: { latitude: number; longitude: number };
  profile: any;
  setActiveTab: (tab: any) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ location, profile, setActiveTab }) => {
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [badges, setBadges] = useState<AchievementBadge[]>([]);
  const [badgeTimeframe, setBadgeTimeframe] = useState<'weekly' | 'quarterly' | 'yearly' | 'lifetime'>('lifetime');

  // Daily totals
  const [todayOsv, setTodayOsv] = useState<number>(0);
  const [todayCalls, setTodayCalls] = useState<number>(0);
  const [todayAppts, setTodayAppts] = useState<number>(0);
  const [todayRev, setTodayRev] = useState<number>(0);

  // Weekly totals
  const [weekOsv, setWeekOsv] = useState<number>(0);
  const [weekCalls, setWeekCalls] = useState<number>(0);
  const [weekAppts, setWeekAppts] = useState<number>(0);
  const [weekRev, setWeekRev] = useState<number>(0);

  // Quota and Milestones states
  const [qSales, setQSales] = useState<number>(0);
  const [fySales, setFYSales] = useState<number>(0);
  const [qDaysPercent, setQDaysPercent] = useState<number>(0);
  const [fyDaysPercent, setFYDaysPercent] = useState<number>(0);
  const [quotaInfo, setQuotaInfo] = useState<{ qNumber: number } | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  // Map DOM reference
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  // Get current day name (lowercase) to lookup targets
  const getDayName = (): 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday' => {
    const days: ('sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday')[] = [
      'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
    ];
    return days[new Date().getDay()] as any;
  };

  const currentDay = getDayName();

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const currentWeekId = getWeekId(new Date());
        
        // Fetch DB data
        const plan = await dbService.getWeeklyPlan(currentWeekId);
        setWeeklyPlan(plan);

        const allLeads = await dbService.getAllLeads();
        setLeads(allLeads);

        // Fetch logs
        const allVisits = await dbService.getAllVisits();
        const allCalls = await dbService.getAllCalls();

        // Calculate time thresholds
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStartTs = todayStart.getTime();

        const mondayStartTs = plan.startDate;

        // --- Today's Metrics ---
        // OSVs completed today
        const OSVsToday = allVisits.filter(v => v.timestamp >= todayStartTs);
        setTodayOsv(OSVsToday.length);

        // Calls completed today
        const callsToday = allCalls.filter(c => c.timestamp >= todayStartTs);
        setTodayCalls(callsToday.length);

        // Appointments set today
        const apptsFromVisitsToday = OSVsToday.filter(v => v.outcome === 'appointment_set').length;
        const apptsFromCallsToday = callsToday.filter(c => c.outcome === 'appointment_set').length;
        setTodayAppts(apptsFromVisitsToday + apptsFromCallsToday);

        // Sold / Revenue completed today
        const soldVisitsToday = OSVsToday.filter(v => v.outcome === 'sold');
        const soldCallsToday = callsToday.filter(c => c.outcome === 'sold');
        
        const revFromVisitsToday = soldVisitsToday.reduce((acc, curr) => {
          const lead = allLeads.find(l => l.id === curr.leadId);
          return acc + (lead?.dealValue || 0);
        }, 0);
        const revFromCallsToday = soldCallsToday.reduce((acc, curr) => {
          const lead = allLeads.find(l => l.id === curr.leadId);
          return acc + (lead?.dealValue || 0);
        }, 0);
        setTodayRev(revFromVisitsToday + revFromCallsToday);

        // --- Week's Metrics ---
        const OSVsThisWeek = allVisits.filter(v => v.timestamp >= mondayStartTs);
        setWeekOsv(OSVsThisWeek.length);

        const callsThisWeek = allCalls.filter(c => c.timestamp >= mondayStartTs);
        setWeekCalls(callsThisWeek.length);

        const apptsFromVisitsWeek = OSVsThisWeek.filter(v => v.outcome === 'appointment_set').length;
        const apptsFromCallsWeek = callsThisWeek.filter(c => c.outcome === 'appointment_set').length;
        setWeekAppts(apptsFromVisitsWeek + apptsFromCallsWeek);

        // Revenue this week
        const soldVisitsWeek = OSVsThisWeek.filter(v => v.outcome === 'sold');
        const soldCallsWeek = callsThisWeek.filter(c => c.outcome === 'sold');
        
        const revFromVisitsWeek = soldVisitsWeek.reduce((acc, curr) => {
          const lead = allLeads.find(l => l.id === curr.leadId);
          return acc + (lead?.dealValue || 0);
        }, 0);
        const revFromCallsWeek = soldCallsWeek.reduce((acc, curr) => {
          const lead = allLeads.find(l => l.id === curr.leadId);
          return acc + (lead?.dealValue || 0);
        }, 0);
        setWeekRev(revFromVisitsWeek + revFromCallsWeek);

        // --- Quota & Milestone Metrics ---
        const getQuotaBoundaries = () => {
          const now = new Date();
          
          // Parse fiscal start from profile, default to 2026-06-01
          const fyStartParts = (profile.fiscalYearStart || '2026-06-01').split('-');
          const fyStartMonthIdx = parseInt(fyStartParts[1], 10) - 1;
          const fyStartDayIdx = parseInt(fyStartParts[2], 10);
          
          // Determine the fiscal start year
          let fyStartYear = parseInt(fyStartParts[0], 10);
          const thisYearFiscalStart = new Date(now.getFullYear(), fyStartMonthIdx, fyStartDayIdx, 0, 0, 0, 0);
          if (now < thisYearFiscalStart) {
            fyStartYear = now.getFullYear() - 1;
          } else {
            fyStartYear = now.getFullYear();
          }

          const fyStart = new Date(fyStartYear, fyStartMonthIdx, fyStartDayIdx, 0, 0, 0, 0);
          const fyEnd = new Date(fyStartYear + 1, fyStartMonthIdx, fyStartDayIdx, 0, 0, 0, 0);
          fyEnd.setTime(fyEnd.getTime() - 1);
          
          const monthsDiff = (now.getFullYear() - fyStart.getFullYear()) * 12 + now.getMonth() - fyStart.getMonth();
          const qIndex = Math.floor(monthsDiff / 3); // 0, 1, 2, 3
          
          const qStart = new Date(fyStart.getFullYear(), fyStart.getMonth() + qIndex * 3, 1, 0, 0, 0, 0);
          const qEnd = new Date(fyStart.getFullYear(), fyStart.getMonth() + (qIndex + 1) * 3, 0, 23, 59, 59, 999);
          
          return {
            fyStart: fyStart.getTime(),
            fyEnd: fyEnd.getTime(),
            qStart: qStart.getTime(),
            qEnd: qEnd.getTime(),
            qNumber: Math.min(4, Math.max(1, qIndex + 1))
          };
        };

        const boundaries = getQuotaBoundaries();
        setQuotaInfo({ qNumber: boundaries.qNumber });

        let qSalesSum = 0;
        let fySalesSum = 0;

        // Sum closed sales
        allLeads.filter(l => l.status === 'sold' && (l.dealValue || 0) > 0).forEach(lead => {
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

          if (soldTime >= boundaries.qStart && soldTime <= boundaries.qEnd) {
            qSalesSum += lead.dealValue || 0;
          }
          if (soldTime >= boundaries.fyStart && soldTime <= boundaries.fyEnd) {
            fySalesSum += lead.dealValue || 0;
          }
        });

        setQSales(qSalesSum);
        setFYSales(fySalesSum);

        const nowTs = Date.now();
        const qLength = boundaries.qEnd - boundaries.qStart;
        const qElapsed = nowTs - boundaries.qStart;
        setQDaysPercent(Math.min(100, Math.max(0, Math.round((qElapsed / qLength) * 100))));

        const fyLength = boundaries.fyEnd - boundaries.fyStart;
        const fyElapsed = nowTs - boundaries.fyStart;
        setFYDaysPercent(Math.min(100, Math.max(0, Math.round((fyElapsed / fyLength) * 100))));

        // Initial fetch of lifetime badges is handled by the other useEffect

      } catch (err) {
        console.error('Error loading dashboard stats', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Fetch badges when timeframe changes
  useEffect(() => {
    const loadBadges = async () => {
      const badgesData = await dbService.getProfileBadges(profile, badgeTimeframe);
      setBadges(badgesData);
    };
    loadBadges();
  }, [badgeTimeframe, profile]);

  // Initialize Map
  useEffect(() => {
    if (loading || !mapRef.current) return;

    const initMap = async () => {
      try {
        (window as any).gm_authFailure = () => {
          console.warn("Google Maps auth failed (likely referrer restrictions on localhost). Falling back to simulated radar.");
          setMapError("Active Territory Radar: Operating in Offline/Demo mode. Pins represent prospects in your pipeline.");
        };

        await loadGoogleMapsScript();
        if (!(window as any).google || !(window as any).google.maps) return;

        const mapOptions = {
          center: { lat: location.latitude, lng: location.longitude },
          zoom: 13,
          mapTypeId: 'hybrid',
          styles: [
            { elementType: "geometry", stylers: [{ color: "#282828" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#282828" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#ebdbb2" }] },
            {
              featureType: "administrative.locality",
              elementType: "labels.text.fill",
              stylers: [{ color: "#fbf1c7" }],
            },
            {
              featureType: "poi",
              elementType: "labels.text.fill",
              stylers: [{ color: "#d3869b" }],
            },
            {
              featureType: "poi.park",
              elementType: "geometry",
              stylers: [{ color: "#3c3836" }],
            },
            {
              featureType: "road",
              elementType: "geometry",
              stylers: [{ color: "#3c3836" }],
            },
            {
              featureType: "road",
              elementType: "geometry.stroke",
              stylers: [{ color: "#504945" }],
            },
            {
              featureType: "road",
              elementType: "labels.text.fill",
              stylers: [{ color: "#a89984" }],
            },
            {
              featureType: "water",
              elementType: "geometry",
              stylers: [{ color: "#1d2021" }],
            },
          ],
          disableDefaultUI: true,
          zoomControl: true,
        };

        const map = new (window as any).google.maps.Map(mapRef.current, mapOptions);
        googleMapInstance.current = map;

        // Current Location marker (glowing green/aqua dot)
        new (window as any).google.maps.Marker({
          position: { lat: location.latitude, lng: location.longitude },
          map,
          title: "My Location",
          icon: {
            path: (window as any).google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#8ec07c",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          }
        });

        // Add Markers for active leads
        markersRef.current.forEach(m => m.setMap(null));
        markersRef.current = [];

        leads.forEach(lead => {
          if (lead.status === 'never_visit' || lead.status === 'no_value') return;

          // Color coded markers
          let markerColor = '#fe8019'; // Pending OSV (Orange)
          if (lead.status === 'phone_block') markerColor = '#fabd2f'; // Call Block (Yellow)
          if (lead.status === 'appointment_set') markerColor = '#83a598'; // Appointment (Teal)
          if (lead.status === 'sold') markerColor = '#b8bb26'; // Sold/Closed Won (Green!)
          if (lead.status === 'snoozed_osv') markerColor = '#a89984'; // Snoozed (Muted Grey)

          const marker = new (window as any).google.maps.Marker({
            position: { lat: lead.latitude, lng: lead.longitude },
            map,
            title: lead.name,
            icon: {
              path: (window as any).google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
              scale: 5,
              fillColor: markerColor,
              fillOpacity: 0.9,
              strokeColor: "#ffffff",
              strokeWeight: 1,
            }
          });

          // InfoWindow click popup
          const infoWindow = new (window as any).google.maps.InfoWindow({
            content: `
              <div style="color: #0f172a; padding: 6px; font-family: sans-serif;">
                <h4 style="margin: 0 0 4px 0; font-weight: 600;">${lead.name}</h4>
                <p style="margin: 0 0 6px 0; font-size: 11px; color: #64748b;">${lead.address}</p>
                <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: ${markerColor}">
                  Status: ${lead.status.replace('_', ' ')} ${lead.dealValue ? `($${lead.dealValue})` : ''}
                </div>
              </div>
            `
          });

          marker.addListener("click", () => {
            infoWindow.open({
              anchor: marker,
              map,
            });
          });

          markersRef.current.push(marker);
        });

      } catch (err) {
        console.error("Map load error:", err);
        setMapError("Demo Mode: Google Maps API key missing. Displaying active territory radar.");
      }
    };

    initMap();
  }, [loading, location, leads]);

  // Daily target values
  const dailyOsvTarget = weeklyPlan?.targets[currentDay]?.osv || 0;
  const dailyCallsTarget = weeklyPlan?.targets[currentDay]?.calls || 0;
  const dailyApptsTarget = weeklyPlan?.targets[currentDay]?.appointments || 0;
  const dailyRevTarget = weeklyPlan?.targets[currentDay]?.revenue || 0;

  // Compute weekly targets by summing Mon-Sun
  const getWeeklyTargetSum = (type: 'osv' | 'calls' | 'appointments' | 'revenue') => {
    if (!weeklyPlan) return 0;
    return Object.values(weeklyPlan.targets).reduce((acc, curr) => acc + (curr[type] || 0), 0);
  };

  const weeklyOsvTarget = getWeeklyTargetSum('osv');
  const weeklyCallsTarget = getWeeklyTargetSum('calls');
  const weeklyApptsTarget = getWeeklyTargetSum('appointments');
  const weeklyRevTarget = getWeeklyTargetSum('revenue');

  // Helper to calculate percentages
  const getPercentage = (value: number, target: number) => {
    if (target === 0) return 0;
    return Math.min(Math.round((value / target) * 100), 100);
  };

  const renderSimulatedMapPins = () => {
    return leads.map((lead) => {
      if (lead.status === 'never_visit' || lead.status === 'no_value') return null;

      const latDiff = lead.latitude - location.latitude;
      const lngDiff = lead.longitude - location.longitude;
      
      const maxDiff = 0.04;
      const x = 150 + (lngDiff / maxDiff) * 120;
      const y = 150 - (latDiff / maxDiff) * 120;
      
      if (x < 15 || x > 285 || y < 15 || y > 285) return null;

      let pinColor = 'hsl(var(--primary))'; 
      if (lead.status === 'phone_block') pinColor = 'hsl(var(--warning))'; 
      if (lead.status === 'appointment_set') pinColor = 'hsl(var(--secondary))'; 
      if (lead.status === 'sold') pinColor = 'hsl(var(--success))'; 
      if (lead.status === 'snoozed_osv') pinColor = 'hsl(var(--text-muted))'; 

      return (
        <g key={lead.id} style={{ cursor: 'pointer' }} onClick={() => alert(`${lead.name}\n${lead.address}\nStatus: ${lead.status.replace('_', ' ')}`)}>
          <circle cx={x} cy={y} r={6} fill={pinColor} opacity={0.35}>
            <animate attributeName="r" values="4;9;4" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx={x} cy={y} r={3.5} fill={pinColor} stroke="#ffffff" strokeWidth={1} />
        </g>
      );
    });
  };

  if (loading) {
    return (
      <div className="leaflet-placeholder">
        <Activity className="animate-pulse" style={{ width: '40px', height: '40px', stroke: '#818cf8' }} />
        <p>Loading Dashboard...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <h1 style={{ fontFamily: 'Outfit', fontSize: '1.75rem' }}>Hello, {profile.repName}</h1>
        <span style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))' }}>
          Here is your sales performance tracking for this week.
        </span>
      </div>

      {/* Ribbon Statistics */}
      <div className="dashboard-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card osv">
          <span className="stat-val">{todayOsv}</span>
          <span className="stat-lbl">Visits</span>
        </div>
        <div className="stat-card pb">
          <span className="stat-val">{todayCalls}</span>
          <span className="stat-lbl">Calls</span>
        </div>
        <div className="stat-card appt">
          <span className="stat-val">{todayAppts}</span>
          <span className="stat-lbl">Appts</span>
        </div>
        <div className="stat-card" style={{ border: '1px solid hsl(var(--success)/0.3)', background: 'hsl(var(--success-glow))' }}>
          <span className="stat-val" style={{ color: 'hsl(var(--success))' }}>${todayRev}</span>
          <span className="stat-lbl" style={{ color: 'hsl(var(--success))' }}>Revenue</span>
        </div>
      </div>

      {/* Career Goals & Quotas Tracker */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid hsl(var(--border-muted))', paddingBottom: '0.5rem' }}>
          <TrendingUp style={{ width: '18px', height: '18px', color: 'hsl(var(--primary))' }} />
          <span style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: '1rem' }}>
            Career Milestones & Quotas Tracker
          </span>
          <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginLeft: 'auto' }}>
            FY Start: {profile.fiscalYearStart ? new Date(profile.fiscalYearStart + 'T00:00:00').toLocaleDateString(undefined, { year: '2-digit', month: 'numeric', day: 'numeric' }) : '6/1/26'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
          {/* Quarter Quota Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'hsl(var(--text-primary))' }}>
                Quarter {quotaInfo?.qNumber || 1} Performance
              </span>
              <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>
                {qDaysPercent}% of quarter elapsed
              </span>
            </div>
            
            <div style={{ background: 'hsla(var(--bg-secondary) / 0.5)', padding: '0.85rem', borderRadius: '10px', border: '1px solid hsl(var(--border-muted))', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span>Closed Sales in Q{quotaInfo?.qNumber || 1}:</span>
                <span style={{ fontWeight: 700, color: 'hsl(var(--success))' }}>${qSales.toLocaleString()}</span>
              </div>

              {/* Summit Progress */}
              <div className="progress-bar-container">
                <div className="progress-bar-label" style={{ fontSize: '0.74rem' }}>
                  <span>Summit Club Target (${(profile.quarterlySummitTarget || 9000).toLocaleString()})</span>
                  <span>{getPercentage(qSales, profile.quarterlySummitTarget || 9000)}%</span>
                </div>
                <div className="progress-track" style={{ height: '6px' }}>
                  <div className="progress-fill" style={{ background: 'linear-gradient(to right, hsl(var(--warning)), hsl(var(--primary)))', width: `${getPercentage(qSales, profile.quarterlySummitTarget || 9000)}%` }} />
                </div>
              </div>

              {/* Presidents Club Progress */}
              <div className="progress-bar-container">
                <div className="progress-bar-label" style={{ fontSize: '0.74rem' }}>
                  <span>Presidents Club Target (${(profile.quarterlyPresidentsClubTarget || 12000).toLocaleString()})</span>
                  <span>{getPercentage(qSales, profile.quarterlyPresidentsClubTarget || 12000)}%</span>
                </div>
                <div className="progress-track" style={{ height: '6px' }}>
                  <div className="progress-fill" style={{ background: 'linear-gradient(to right, hsl(var(--primary)), hsl(var(--danger)))', width: `${getPercentage(qSales, profile.quarterlyPresidentsClubTarget || 12000)}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Full Fiscal Year Quota Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'hsl(var(--text-primary))' }}>
                Full Fiscal Year Performance
              </span>
              <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>
                {fyDaysPercent}% of FY elapsed
              </span>
            </div>

            <div style={{ background: 'hsla(var(--bg-secondary) / 0.5)', padding: '0.85rem', borderRadius: '10px', border: '1px solid hsl(var(--border-muted))', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span>Total Closed FY Sales:</span>
                <span style={{ fontWeight: 700, color: 'hsl(var(--success))' }}>${fySales.toLocaleString()}</span>
              </div>

              {/* FY Summit Progress */}
              <div className="progress-bar-container">
                <div className="progress-bar-label" style={{ fontSize: '0.74rem' }}>
                  <span>Summit FY Target (${((profile.quarterlySummitTarget || 9000) * 4).toLocaleString()})</span>
                  <span>{getPercentage(fySales, (profile.quarterlySummitTarget || 9000) * 4)}%</span>
                </div>
                <div className="progress-track" style={{ height: '6px' }}>
                  <div className="progress-fill" style={{ background: 'linear-gradient(to right, hsl(var(--warning)), hsl(var(--primary)))', width: `${getPercentage(fySales, (profile.quarterlySummitTarget || 9000) * 4)}%` }} />
                </div>
              </div>

              {/* FY Presidents Club Progress */}
              <div className="progress-bar-container">
                <div className="progress-bar-label" style={{ fontSize: '0.74rem' }}>
                  <span>Presidents Club FY Target (${((profile.quarterlyPresidentsClubTarget || 12000) * 4).toLocaleString()})</span>
                  <span>{getPercentage(fySales, (profile.quarterlyPresidentsClubTarget || 12000) * 4)}%</span>
                </div>
                <div className="progress-track" style={{ height: '6px' }}>
                  <div className="progress-fill" style={{ background: 'linear-gradient(to right, hsl(var(--primary)), hsl(var(--danger)))', width: `${getPercentage(fySales, (profile.quarterlyPresidentsClubTarget || 12000) * 4)}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Achievement Badges Panel */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid hsl(var(--border-muted))', paddingBottom: '0.5rem' }}>
          <Award style={{ width: '18px', height: '18px', color: 'hsl(var(--warning))' }} />
          <span style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: '1rem' }}>
            Achievement Badges
          </span>
          <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginLeft: 'auto' }}>
            {badges.filter(b => b.unlocked).length} / {badges.length} Unlocked
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem', scrollbarWidth: 'none' }}>
          {(['weekly', 'quarterly', 'yearly', 'lifetime'] as const).map(tf => (
            <button
              key={tf}
              onClick={() => setBadgeTimeframe(tf)}
              style={{
                background: badgeTimeframe === tf ? 'hsl(var(--primary) / 0.15)' : 'transparent',
                color: badgeTimeframe === tf ? 'hsl(var(--primary))' : 'hsl(var(--text-muted))',
                border: `1px solid ${badgeTimeframe === tf ? 'hsl(var(--primary) / 0.3)' : 'hsl(var(--border-muted))'}`,
                padding: '0.35rem 0.75rem',
                borderRadius: '1rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'capitalize',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap'
              }}
            >
              {tf}
            </button>
          ))}
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', 
          gap: '1rem',
          marginTop: '0.5rem'
        }}>
          {badges.map(badge => (
            <div 
              key={badge.id}
              className={`glass-card ${badge.unlocked ? 'badge-unlocked' : ''}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: '1rem 0.75rem',
                gap: '0.5rem',
                opacity: badge.unlocked ? 1 : 0.45,
                filter: badge.unlocked ? 'none' : 'grayscale(100%)',
                borderColor: badge.unlocked ? 'hsl(var(--primary))' : 'hsl(var(--border-muted))',
                boxShadow: badge.unlocked ? '0 0 12px hsl(var(--primary) / 0.15)' : 'none',
                position: 'relative',
                cursor: 'help'
              }}
              title={badge.description}
            >
              {badge.isCustom && (
                <span style={{ 
                  position: 'absolute', 
                  top: '4px', 
                  right: '4px', 
                  fontSize: '0.55rem', 
                  background: 'hsl(var(--primary) / 0.15)', 
                  color: 'hsl(var(--primary))', 
                  padding: '1px 4px', 
                  borderRadius: '4px',
                  fontWeight: 700,
                  textTransform: 'uppercase'
                }}>
                  Co.
                </span>
              )}
              {/* Badge Icon Circular wrapper */}
              <div 
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '50%',
                  background: badge.unlocked 
                    ? 'radial-gradient(circle, hsl(var(--primary) / 0.2) 0%, hsl(var(--bg-secondary)) 70%)'
                    : 'hsl(var(--bg-secondary))',
                  border: `2px solid ${badge.unlocked ? 'hsl(var(--primary))' : 'hsl(var(--border-muted))'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                  filter: badge.unlocked ? 'drop-shadow(0 0 4px hsl(var(--primary) / 0.4))' : 'none'
                }}
              >
                {badge.icon}
              </div>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'hsl(var(--text-primary))' }}>
                {badge.title}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))', fontWeight: 500 }}>
                {badge.progressText}
              </span>
              {!badge.unlocked && (
                <div style={{ width: '100%', background: 'hsl(var(--bg-secondary))', height: '4px', borderRadius: '2px', overflow: 'hidden', marginTop: '0.2rem' }}>
                  <div 
                    style={{ 
                      width: `${badge.progressPercent}%`, 
                      background: 'hsl(var(--primary))', 
                      height: '100%', 
                      borderRadius: '2px' 
                    }} 
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Task Planner Panel */}
      <TodoList />

      {/* Map and targets grid */}
      <div className="dashboard-grid">
        {/* Map panel */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid hsl(var(--border-muted))', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MapIcon style={{ width: '18px', height: '18px', color: 'hsl(var(--secondary))' }} />
            <span style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: '0.95rem' }}>Territory Map</span>
          </div>
          {mapError && (
            <div style={{
              width: '100%',
              height: '320px',
              background: 'radial-gradient(circle, hsl(var(--bg-tertiary)) 0%, hsl(var(--bg-primary)) 100%)',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderBottom: '1px solid hsl(var(--border-muted))'
            }}>
              <svg width="280" height="280" viewBox="0 0 300 300" style={{ position: 'absolute', top: 10, left: 'calc(50% - 140px)' }}>
                <circle cx="150" cy="150" r="140" fill="none" stroke="hsla(var(--primary) / 0.15)" strokeWidth="1" strokeDasharray="4 4" />
                <circle cx="150" cy="150" r="100" fill="none" stroke="hsla(var(--primary) / 0.15)" strokeWidth="1" />
                <circle cx="150" cy="150" r="60" fill="none" stroke="hsla(var(--primary) / 0.15)" strokeWidth="1" />
                <line x1="150" y1="10" x2="150" y2="290" stroke="hsla(var(--primary) / 0.1)" strokeWidth="1" />
                <line x1="10" y1="150" x2="290" y2="150" stroke="hsla(var(--primary) / 0.1)" strokeWidth="1" />
                
                {/* Center User Location Pin */}
                <circle cx="150" cy="150" r="8" fill="hsl(var(--success))" opacity="0.3">
                  <animate attributeName="r" values="5;12;5" dur="1.8s" repeatCount="indefinite" />
                </circle>
                <circle cx="150" cy="150" r="4" fill="hsl(var(--success))" stroke="#fff" strokeWidth="1.5" />
                
                {/* Leads Pins */}
                {renderSimulatedMapPins()}
              </svg>
              
              <div style={{
                position: 'absolute',
                bottom: '10px',
                left: '10px',
                right: '10px',
                background: 'hsla(var(--bg-secondary) / 0.85)',
                backdropFilter: 'blur(4px)',
                padding: '0.35rem 0.5rem',
                borderRadius: '6px',
                fontSize: '0.72rem',
                textAlign: 'center',
                color: 'hsl(var(--text-secondary))',
                border: '1px solid hsl(var(--border-muted))'
              }}>
                🛰️ Active Territory Radar: Operating in Offline/Demo mode. Pins represent prospects in your pipeline.
              </div>
            </div>
          )}
          <div 
            className="map-panel" 
            ref={mapRef}
            style={{ display: mapError ? 'none' : 'block' }}
          >
            <div className="leaflet-placeholder">Loading interactive map...</div>
          </div>
        </div>

        {/* Goals / Targets progress panel */}
        <div className="glass-panel progress-section">
          <div className="progress-header">
            <span className="progress-title">Target Progress</span>
            <span className="progress-week-indicator">Week {weeklyPlan?.id.split('-W')[1]}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '0.5rem' }}>
            {/* Daily OSVs progress */}
            <div className="progress-bar-container">
              <div className="progress-bar-label">
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <MapPin style={{ width: '14px', height: '14px', stroke: 'hsl(var(--secondary))' }} /> 
                  On-Site Visits
                </span>
                <span>{todayOsv} / {dailyOsvTarget} ({getPercentage(todayOsv, dailyOsvTarget)}%)</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill osv" style={{ width: `${getPercentage(todayOsv, dailyOsvTarget)}%` }} />
              </div>
            </div>

            {/* Daily Calls progress */}
            <div className="progress-bar-container">
              <div className="progress-bar-label">
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Phone style={{ width: '14px', height: '14px', stroke: 'hsl(var(--primary))' }} /> 
                  Cold Calls
                </span>
                <span>{todayCalls} / {dailyCallsTarget} ({getPercentage(todayCalls, dailyCallsTarget)}%)</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill calls" style={{ width: `${getPercentage(todayCalls, dailyCallsTarget)}%` }} />
              </div>
            </div>

            {/* Daily Appts progress */}
            <div className="progress-bar-container">
              <div className="progress-bar-label">
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Calendar style={{ width: '14px', height: '14px', stroke: 'hsl(var(--warning))' }} /> 
                  Appointments Set
                </span>
                <span>{todayAppts} / {dailyApptsTarget} ({getPercentage(todayAppts, dailyApptsTarget)}%)</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill appointments" style={{ width: `${getPercentage(todayAppts, dailyApptsTarget)}%` }} />
              </div>
            </div>

            {/* Daily Revenue progress */}
            <div className="progress-bar-container">
              <div className="progress-bar-label">
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <DollarSign style={{ width: '14px', height: '14px', stroke: 'hsl(var(--success))' }} /> 
                  Closed Revenue (Daily)
                </span>
                <span>${todayRev} / ${dailyRevTarget} ({getPercentage(todayRev, dailyRevTarget)}%)</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill appointments" style={{ background: 'hsl(var(--success))', width: `${getPercentage(todayRev, dailyRevTarget)}%` }} />
              </div>
            </div>

            {/* Weekly OSV progress */}
            <div style={{ marginTop: '0.5rem', borderTop: '1px solid hsl(var(--border-muted))', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'hsl(var(--text-muted))' }}>
                <TrendingUp style={{ width: '14px', height: '14px' }} />
                <span>WEEKLY TARGET PROGRESS</span>
              </div>

              <div className="progress-bar-container">
                <div className="progress-bar-label" style={{ fontSize: '0.74rem' }}>
                  <span>On-Site Visits</span>
                  <span>{weekOsv} / {weeklyOsvTarget} ({getPercentage(weekOsv, weeklyOsvTarget)}%)</span>
                </div>
                <div className="progress-track" style={{ height: '6px' }}>
                  <div className="progress-fill osv" style={{ width: `${getPercentage(weekOsv, weeklyOsvTarget)}%` }} />
                </div>
              </div>

              <div className="progress-bar-container">
                <div className="progress-bar-label" style={{ fontSize: '0.74rem' }}>
                  <span>Cold Calls</span>
                  <span>{weekCalls} / {weeklyCallsTarget} ({getPercentage(weekCalls, weeklyCallsTarget)}%)</span>
                </div>
                <div className="progress-track" style={{ height: '6px' }}>
                  <div className="progress-fill calls" style={{ width: `${getPercentage(weekCalls, weeklyCallsTarget)}%` }} />
                </div>
              </div>

              <div className="progress-bar-container">
                <div className="progress-bar-label" style={{ fontSize: '0.74rem' }}>
                  <span>Appointments Set</span>
                  <span>{weekAppts} / {weeklyApptsTarget} ({getPercentage(weekAppts, weeklyApptsTarget)}%)</span>
                </div>
                <div className="progress-track" style={{ height: '6px' }}>
                  <div className="progress-fill appointments" style={{ width: `${getPercentage(weekAppts, weeklyApptsTarget)}%` }} />
                </div>
              </div>

              <div className="progress-bar-container">
                <div className="progress-bar-label" style={{ fontSize: '0.74rem' }}>
                  <span>Closed Revenue</span>
                  <span>${weekRev} / ${weeklyRevTarget} ({getPercentage(weekRev, weeklyRevTarget)}%)</span>
                </div>
                <div className="progress-track" style={{ height: '6px' }}>
                  <div className="progress-fill appointments" style={{ background: 'hsl(var(--success))', width: `${getPercentage(weekRev, weeklyRevTarget)}%` }} />
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Helpful Action Suggestions */}
      <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h3 style={{ fontFamily: 'Outfit', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <AlertCircle style={{ width: '16px', height: '16px', color: 'hsl(var(--primary))' }} />
          Smart Recommendations
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
          <button 
            className="glass-card" 
            style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}
            onClick={() => setActiveTab('discover')}
          >
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--secondary))' }}>Find Prospects Nearby</span>
            <span style={{ fontSize: '0.74rem', color: 'hsl(var(--text-secondary))' }}>Swipe new businesses matching your uniform parameters to add to your target list.</span>
          </button>
          
          <button 
            className="glass-card" 
            style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}
            onClick={() => setActiveTab('leads')}
          >
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--primary))' }}>Pending OSVs ({leads.filter(l => l.status === 'pending_osv').length})</span>
            <span style={{ fontSize: '0.74rem', color: 'hsl(var(--text-secondary))' }}>Log physical visits, check decision makers, and define next-step actions.</span>
          </button>

          <button 
            className="glass-card" 
            style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}
            onClick={() => setActiveTab('phoneblock')}
          >
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--success))' }}>Start Phone Call Block ({leads.filter(l => l.status === 'phone_block').length})</span>
            <span style={{ fontSize: '0.74rem', color: 'hsl(var(--text-secondary))' }}>Call leads qualified during physical visits to book presentations.</span>
          </button>

          {!profile?.organizationId && (
            <button 
              className="glass-card animate-pulse-subtle" 
              style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.35rem', border: '1px dashed hsl(var(--primary) / 0.5)', background: 'hsl(var(--primary) / 0.03)' }}
              onClick={() => setActiveTab('company')}
            >
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--primary))' }}>🏢 Join or Create Company</span>
              <span style={{ fontSize: '0.74rem', color: 'hsl(var(--text-secondary))' }}>Sync with your team, view leaderboards, and align locked daily quota targets.</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
