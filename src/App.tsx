import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Radar, 
  Users, 
  PhoneCall, 
  Settings as SettingsIcon, 
  Wifi, 
  WifiOff 
} from 'lucide-react';
import { dbService } from './services/db';
import type { Profile } from './services/db';

// Component imports
import Dashboard from './components/Dashboard';
import DiscoverSwiper from './components/DiscoverSwiper';
import LeadManager from './components/LeadManager';
import PhoneBlock from './components/PhoneBlock';
import Settings from './components/Settings';

export type TabType = 'dashboard' | 'discover' | 'leads' | 'phoneblock' | 'settings';

const App: React.FC = () => {
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

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
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
        const userProfile = await dbService.getProfile();
        setProfile(userProfile);
        setDbInitialized(true);
      } catch (err) {
        console.error('Failed to initialize database or profile', err);
      }
    };
    initDb();
  }, []);

  // Monitor location
  useEffect(() => {
    if (isSimulatedLoc) return; // Don't overwrite simulation

    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude
          });
          
          // Save last known location to profile if DB is ready
          if (dbInitialized && profile) {
            dbService.saveProfile({
              ...profile,
              lastLatitude: pos.coords.latitude,
              lastLongitude: pos.coords.longitude
            } as any);
          }
        },
        (err) => {
          console.warn('Geolocation error:', err);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );

      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [isSimulatedLoc, dbInitialized, profile]);

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
      {/* Dynamic Header */}
      <header className="app-header">
        <div className="brand">
          <Radar style={{ width: '24px', height: '24px' }} />
          <span>SalesFlow</span>
        </div>
        
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
          onClick={() => setActiveTab('discover')}
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
          className={`tab-button ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <SettingsIcon />
          <span>Settings</span>
        </button>
      </nav>
    </div>
  );
};

export default App;
