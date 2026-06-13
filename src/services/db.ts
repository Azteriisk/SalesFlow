export interface Profile {
  id: string; // "user_profile"
  repName: string;
  industryFilters: string[]; // List of categories to search (e.g. ["auto_repair", "restaurant", "warehouse"])
  searchRadiusKm: number;
  fiscalYearStart?: string;
  quarterlySummitTarget?: number;
  quarterlyPresidentsClubTarget?: number;
}

export type LeadStatus = 'pending_osv' | 'phone_block' | 'appointment_set' | 'sold' | 'no_value' | 'never_visit' | 'snoozed_osv';

export interface Quote {
  id: string;
  amount: number;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

export interface Lead {
  id: string; // Google Place ID or custom UUID
  name: string;
  address: string;
  phone?: string;
  website?: string;
  latitude: number;
  longitude: number;
  category: string; // e.g. "car_repair", "restaurant", "warehouse"
  status: LeadStatus;
  notes?: string;
  gatekeeper?: string;
  decisionMaker?: string;
  snoozeUntil?: number; // timestamp
  addedAt: number;
  dealValue?: number; // contract sold value ($)
  quotes?: Quote[]; // attached quotes list
}

export interface RecommendationDecision {
  placeId: string;
  status: 'liked' | 'disliked_irrelevant' | 'never_visit';
  decidedAt: number;
  category?: string;
  rating?: number;
  userRatingsTotal?: number;
}

export interface Visit {
  id: string;
  leadId: string;
  timestamp: number;
  outcome: 'phone_block' | 'appointment_set' | 'sold' | 'no_value' | 'never_visit' | 'snooze';
  spokeWith?: string;
  isDecisionMaker: boolean;
  notes: string;
  images?: string[];
}

export interface Call {
  id: string;
  leadId: string;
  timestamp: number;
  outcome: 'no_answer' | 'gatekeeper_blocked' | 'spoke_to_dm' | 'appointment_set' | 'sold' | 'no_value' | 'never_visit';
  notes: string;
  images?: string[];
}

export interface EmailLog {
  id: string;
  leadId: string;
  timestamp: number;
  subject: string;
  body: string;
  outcome: 'sent';
}

export interface DailyTargets {
  osv: number;
  calls: number;
  appointments: number;
  revenue: number; // Daily sales revenue target ($)
}

export interface WeeklyPlan {
  id: string; // e.g. "2026-W24"
  startDate: number; // timestamp of Monday midnight
  targets: {
    monday: DailyTargets;
    tuesday: DailyTargets;
    wednesday: DailyTargets;
    thursday: DailyTargets;
    friday: DailyTargets;
    saturday: DailyTargets;
    sunday: DailyTargets;
  };
}

export function getMonday(d: Date): Date {
  const target = new Date(d.getTime());
  const day = target.getDay();
  const diff = target.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  const monday = new Date(target.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function getWeekId(d: Date): string {
  const monday = getMonday(d);
  const year = monday.getFullYear();
  const oneJan = new Date(year, 0, 1);
  const numberOfDays = Math.floor((monday.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
  const week = Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

const DB_NAME = 'SalesFlowDB';
const DB_VERSION = 3; // Incremented version to support Quotes, EmailLogs, Leads Sold status, deal values, and weekly targets

export class SalesFlowDB {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB');
        this.initPromise = null;
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = () => {
        const db = request.result;
        
        // Profile store
        if (!db.objectStoreNames.contains('profile')) {
          db.createObjectStore('profile', { keyPath: 'id' });
        }
        
        // Leads store
        if (!db.objectStoreNames.contains('leads')) {
          const leadsStore = db.createObjectStore('leads', { keyPath: 'id' });
          leadsStore.createIndex('status', 'status', { unique: false });
          leadsStore.createIndex('addedAt', 'addedAt', { unique: false });
        }
        
        // Decisions store (swipe results)
        if (!db.objectStoreNames.contains('decisions')) {
          db.createObjectStore('decisions', { keyPath: 'placeId' });
        }
        
        // Visits history
        if (!db.objectStoreNames.contains('visits')) {
          const visitsStore = db.createObjectStore('visits', { keyPath: 'id' });
          visitsStore.createIndex('leadId', 'leadId', { unique: false });
          visitsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        // Calls history
        if (!db.objectStoreNames.contains('calls')) {
          const callsStore = db.createObjectStore('calls', { keyPath: 'id' });
          callsStore.createIndex('leadId', 'leadId', { unique: false });
          callsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Weekly plans store
        if (!db.objectStoreNames.contains('weekly_plans')) {
          db.createObjectStore('weekly_plans', { keyPath: 'id' });
        }

        // Email Logs store (outreach)
        if (!db.objectStoreNames.contains('emails')) {
          const emailsStore = db.createObjectStore('emails', { keyPath: 'id' });
          emailsStore.createIndex('leadId', 'leadId', { unique: false });
          emailsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  private getStore(name: string, mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) throw new Error('Database not initialized');
    const transaction = this.db.transaction(name, mode);
    return transaction.objectStore(name);
  }

  // --- Profile CRUD ---
  async getProfile(): Promise<Profile> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('profile', 'readonly');
        const request = store.get('user_profile');
        request.onsuccess = () => {
          if (request.result) {
            resolve(request.result);
          } else {
            // Default Profile
            const defaultProfile: Profile = {
              id: 'user_profile',
              repName: 'Sales Representative',
              industryFilters: ['auto_repair', 'warehouse', 'restaurant', 'contractor', 'waste_management'],
              searchRadiusKm: 15,
              fiscalYearStart: '2026-06-01',
              quarterlySummitTarget: 9000,
              quarterlyPresidentsClubTarget: 12000
            };
            this.saveProfile(defaultProfile).then(() => resolve(defaultProfile));
          }
        };
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async saveProfile(profile: Profile): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('profile', 'readwrite');
        const request = store.put(profile);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  // --- Leads CRUD ---
  async getLead(id: string): Promise<Lead | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('leads', 'readonly');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async saveLead(lead: Lead): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('leads', 'readwrite');
        const request = store.put(lead);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async deleteLead(id: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('leads', 'readwrite');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getLeadsByStatus(status: LeadStatus): Promise<Lead[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('leads', 'readonly');
        const index = store.index('status');
        const request = index.getAll(status);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getAllLeads(): Promise<Lead[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('leads', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  // --- Decisions CRUD (Discover swipe results) ---
  async saveDecision(decision: RecommendationDecision): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('decisions', 'readwrite');
        const request = store.put(decision);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getDecision(placeId: string): Promise<RecommendationDecision | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('decisions', 'readonly');
        const request = store.get(placeId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getAllDecisions(): Promise<RecommendationDecision[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('decisions', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  // --- Visits CRUD ---
  async addVisit(visit: Visit): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('visits', 'readwrite');
        const request = store.put(visit);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getVisitsForLead(leadId: string): Promise<Visit[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('visits', 'readonly');
        const index = store.index('leadId');
        const request = index.getAll(leadId);
        request.onsuccess = () => {
          const results = request.result || [];
          results.sort((a, b) => b.timestamp - a.timestamp);
          resolve(results);
        };
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getAllVisits(): Promise<Visit[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('visits', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => {
          const results = request.result || [];
          results.sort((a, b) => b.timestamp - a.timestamp);
          resolve(results);
        };
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  // --- Calls CRUD ---
  async addCall(call: Call): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('calls', 'readwrite');
        const request = store.put(call);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getCallsForLead(leadId: string): Promise<Call[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('calls', 'readonly');
        const index = store.index('leadId');
        const request = index.getAll(leadId);
        request.onsuccess = () => {
          const results = request.result || [];
          results.sort((a, b) => b.timestamp - a.timestamp);
          resolve(results);
        };
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getAllCalls(): Promise<Call[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('calls', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => {
          const results = request.result || [];
          results.sort((a, b) => b.timestamp - a.timestamp);
          resolve(results);
        };
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  // --- Email Logs CRUD ---
  async addEmail(email: EmailLog): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('emails', 'readwrite');
        const request = store.put(email);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getEmailsForLead(leadId: string): Promise<EmailLog[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('emails', 'readonly');
        const index = store.index('leadId');
        const request = index.getAll(leadId);
        request.onsuccess = () => {
          const results = request.result || [];
          results.sort((a, b) => b.timestamp - a.timestamp);
          resolve(results);
        };
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getAllEmails(): Promise<EmailLog[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('emails', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => {
          const results = request.result || [];
          results.sort((a, b) => b.timestamp - a.timestamp);
          resolve(results);
        };
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  // --- Weekly Plans CRUD ---
  async getWeeklyPlan(weekId: string): Promise<WeeklyPlan> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('weekly_plans', 'readonly');
        const request = store.get(weekId);
        request.onsuccess = () => {
          if (request.result) {
            resolve(request.result);
          } else {
            // Monday of the week is computed
            const parts = weekId.split('-W');
            const year = parseInt(parts[0], 10);
            const weekNum = parseInt(parts[1], 10);
            
            // Approximate start date
            const simpleDate = new Date(year, 0, 1 + (weekNum - 1) * 7);
            const monday = getMonday(simpleDate);
            
            const newPlan: WeeklyPlan = {
              id: weekId,
              startDate: monday.getTime(),
              targets: {
                monday: { osv: 10, calls: 50, appointments: 2, revenue: 40 },
                tuesday: { osv: 10, calls: 0, appointments: 4, revenue: 40 },
                wednesday: { osv: 10, calls: 50, appointments: 2, revenue: 40 },
                thursday: { osv: 10, calls: 0, appointments: 4, revenue: 40 },
                friday: { osv: 10, calls: 25, appointments: 2, revenue: 40 },
                saturday: { osv: 0, calls: 0, appointments: 0, revenue: 0 },
                sunday: { osv: 0, calls: 0, appointments: 0, revenue: 0 }
              }
            };
            this.saveWeeklyPlan(newPlan).then(() => resolve(newPlan));
          }
        };
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async saveWeeklyPlan(plan: WeeklyPlan): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('weekly_plans', 'readwrite');
        const request = store.put(plan);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  // --- Reset database utility ---
  async clearAllData(): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      if (!this.db) return reject('No database open');
      const stores = ['profile', 'leads', 'decisions', 'visits', 'calls', 'weekly_plans', 'emails'];
      const transaction = this.db.transaction(stores, 'readwrite');
      
      stores.forEach(s => {
        transaction.objectStore(s).clear();
      });

      transaction.oncomplete = () => {
        // Re-initialize default profile
        const defaultProfile: Profile = {
          id: 'user_profile',
          repName: 'Sales Representative',
          industryFilters: ['auto_repair', 'warehouse', 'restaurant', 'contractor', 'waste_management'],
          searchRadiusKm: 15,
          fiscalYearStart: '2026-06-01',
          quarterlySummitTarget: 9000,
          quarterlyPresidentsClubTarget: 12000
        };
        this.saveProfile(defaultProfile).then(() => resolve());
      };

      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// Global singleton window wrapper to ensure perfect singleton resolution across Vite imports / HMR evaluations
if (!(window as any).__dbServiceInstance) {
  (window as any).__dbServiceInstance = new SalesFlowDB();
}
export const dbService: SalesFlowDB = (window as any).__dbServiceInstance;
