import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Radar, 
  Users, 
  PhoneCall, 
  Settings as SettingsIcon, 
  Wifi, 
  WifiOff,
  Building
} from 'lucide-react';
import { SignedIn, SignedOut, SignIn, UserButton, useUser, useAuth } from './services/clerk';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { dbService } from './services/db';
import type { Profile } from './services/db';
import { 
  checkAndTriggerAppointmentReminders, 
  checkDailyOsvMotivationAlert,
  checkProximityArrivalAlerts
} from './services/notifications';
import { 
  registerBackgroundSync, 
  registerPeriodicSync, 
  syncDataWithCloud 
} from './services/sync';

// Component imports
import Dashboard from './components/Dashboard';
import DiscoverSwiper from './components/DiscoverSwiper';
import LeadManager from './components/LeadManager';
import PhoneBlock from './components/PhoneBlock';
import Settings from './components/Settings';
import CompanyManagement from './components/CompanyManagement';

export type TabType = 'dashboard' | 'discover' | 'leads' | 'phoneblock' | 'company' | 'settings';

const App: React.FC = () => {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [dbInitialized, setDbInitialized] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  
  // Geolocation state
  const [location, setLocation] = useState<{ latitude: number; longitude: number }>({
    latitude: 41.8781, // Default Chicago
    longitude: -87.6298
  });
  const [isSimulatedLoc, setIsSimulatedLoc] = useState<boolean>(false);

  // Monitor online status & auto-sync when online
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      // Auto-sync offline changes with cloud when connection returns
      getToken({ template: 'supabase' }).then(token => {
        return syncDataWithCloud(token || undefined);
      }).then(result => {
        if (result && result.success && (result.pushed > 0 || result.pulled > 0)) {
          console.log(`Auto-sync success: Pushed ${result.pushed}, Pulled ${result.pulled} updates.`);
        }
      }).catch(err => {
        console.error('Auto-sync failed on reconnect:', err);
      });
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initialize DB and fetch Profile
  useEffect(() => {
    const initDb = async () => {
      try {
        await dbService.init();

        // Request storage persistence if supported to prevent OS deletion in low disk conditions
        if (navigator.storage && navigator.storage.persist) {
          try {
            const persisted = await navigator.storage.persist();
            console.log(`[Storage] Persistence granted: ${persisted}`);
          } catch (e) {
            console.warn('[Storage] Failed to request storage persistence', e);
          }
        }

        let userProfile = await dbService.getProfile();
        
        if (user && user.id) {
          let updated = false;
          if ((userProfile as any).clerkUserId !== user.id) {
            (userProfile as any).clerkUserId = user.id;
            updated = true;
          }
          if (userProfile.repName === 'Sales Representative' && user.fullName) {
            userProfile.repName = user.fullName;
            updated = true;
          }
          if (updated) {
            await dbService.saveProfile(userProfile);
          }
        }
        
        setProfile(userProfile);
        setDbInitialized(true);
      } catch (err) {
        console.error('Failed to initialize database or profile', err);
      }
    };
    initDb();
  }, [user?.id, user?.fullName]);

  // Register background sync & periodic sync when DB is ready
  useEffect(() => {
    if (dbInitialized) {
      registerBackgroundSync();
      registerPeriodicSync();
    }
  }, [dbInitialized]);

  // Start periodic scanners for reminders and motivation alerts
  useEffect(() => {
    if (!dbInitialized) return;

    // Run immediately on startup
    checkAndTriggerAppointmentReminders();
    checkDailyOsvMotivationAlert();

    const interval = setInterval(() => {
      checkAndTriggerAppointmentReminders();
      checkDailyOsvMotivationAlert();
    }, 60000); // Check every 60 seconds

    return () => clearInterval(interval);
  }, [dbInitialized]);

  // Get initial location on startup
  useEffect(() => {
    if (isSimulatedLoc) return;

    const getInitialLocation = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setLocation({ latitude: lat, longitude: lng });
          checkProximityArrivalAlerts(lat, lng);
        } catch (err) {
          console.warn('Native initial geolocation failed:', err);
        }
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            setLocation({ latitude: lat, longitude: lng });
            checkProximityArrivalAlerts(lat, lng);
          },
          (err) => {
            console.warn('Browser initial geolocation failed:', err);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      }
    };

    getInitialLocation();
  }, [isSimulatedLoc]);

  const refreshLocation = async () => {
    if (isSimulatedLoc) return;

    const handleNewLocation = (lat: number, lng: number) => {
      setLocation({ latitude: lat, longitude: lng });
      checkProximityArrivalAlerts(lat, lng);
      
      if (dbInitialized && profile) {
        dbService.saveProfile({
          ...profile,
          lastLatitude: lat,
          lastLongitude: lng
        } as any);
      }
    };

    if (Capacitor.isNativePlatform()) {
      try {
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 5000 });
        handleNewLocation(pos.coords.latitude, pos.coords.longitude);
      } catch (err) {
        console.warn('Failed to refresh native location:', err);
      }
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          handleNewLocation(pos.coords.latitude, pos.coords.longitude);
        },
        (err) => {
          console.warn('Failed to refresh browser location:', err);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }
  };

  const handleProfileUpdate = async (updatedProfile: Profile) => {
    setProfile(updatedProfile);
    await dbService.saveProfile(updatedProfile);
  };

  const handleSimulateLocation = (lat: number, lng: number) => {
    setLocation({ latitude: lat, longitude: lng });
    setIsSimulatedLoc(true);
  };

  const handleResetLocation = () => {
    setIsSimulatedLoc(false);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        });
      });
    }
  };

  if (!dbInitialized || !profile) {
    return (
      <div className="leaflet-placeholder">
        <Radar className="animate-pulse" style={{ width: '48px', height: '48px', stroke: '#818cf8' }} />
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 600 }}>Initializing SalesFlow...</h3>
      </div>
    );
  }

  // Render active tab view
  const renderView = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard 
            location={location} 
            profile={profile} 
            setActiveTab={setActiveTab}
          />
        );
      case 'discover':
        return (
          <DiscoverSwiper 
            location={location} 
            profile={profile} 
          />
        );
      case 'leads':
        return (
          <LeadManager 
            location={location}
          />
        );
      case 'phoneblock':
        return (
          <PhoneBlock />
        );
      case 'company':
        return (
          <CompanyManagement 
            profile={profile}
            onProfileUpdate={handleProfileUpdate}
          />
        );
      case 'settings':
        return (
          <Settings 
            profile={profile} 
            onProfileUpdate={handleProfileUpdate}
            location={location}
            onSimulateLocation={handleSimulateLocation}
            onResetLocation={handleResetLocation}
            isLocationSimulated={isSimulatedLoc}
          />
        );
      default:
        return <Dashboard location={location} profile={profile} setActiveTab={setActiveTab} />;
    }
  };

  return (
    <div className="app-container">
      <SignedOut>
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SignIn routing="hash" />
        </div>
      </SignedOut>

      <SignedIn>
        {/* Dynamic Header */}
        <header className="app-header">
          <div className="brand">
            <Radar style={{ width: '24px', height: '24px' }} />
            <span>SalesFlow</span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Offline Badge */}
            {isOffline ? (
              <div className="offline-badge">
                <WifiOff style={{ width: '14px', height: '14px' }} />
                <span>Offline</span>
              </div>
            ) : (
              <div className="offline-badge" style={{ background: 'hsl(142 70% 45% / 0.1)', border: '1px solid hsl(142 70% 45% / 0.3)', color: 'hsl(142 70% 45%)' }}>
                <Wifi style={{ width: '14px', height: '14px' }} />
                <span>Connected</span>
              </div>
            )}
            <UserButton />
          </div>
        </header>

      {/* Main Container */}
      <main className="main-content">
        {renderView()}
      </main>

      {/* Navigation Tab Bar */}
      <nav className="tab-bar">
        <button 
          className={`tab-button ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <LayoutDashboard />
          <span>Dashboard</span>
        </button>
        
        <button 
          className={`tab-button ${activeTab === 'discover' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('discover');
            refreshLocation();
          }}
        >
          <Radar />
          <span>Discover</span>
        </button>
        
        <button 
          className={`tab-button ${activeTab === 'leads' ? 'active' : ''}`}
          onClick={() => setActiveTab('leads')}
        >
          <Users />
          <span>Pipeline</span>
        </button>
        
        <button 
          className={`tab-button ${activeTab === 'phoneblock' ? 'active' : ''}`}
          onClick={() => setActiveTab('phoneblock')}
        >
          <PhoneCall />
          <span>Calls</span>
        </button>
        
        <button 
          className={`tab-button ${activeTab === 'company' ? 'active' : ''}`}
          onClick={() => setActiveTab('company')}
        >
          <Building />
          <span>Company</span>
        </button>

        <button 
          className={`tab-button ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <SettingsIcon />
          <span>Settings</span>
        </button>
      </nav>
      </SignedIn>
    </div>
  );
};

export default App;
