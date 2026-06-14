import { getEncryptionKey, encryptField, decryptField } from './crypto';

export interface Profile {
  id: string; // "user_profile"
  repName: string;
  industryFilters: string[]; // List of categories to search (e.g. ["auto_repair", "restaurant", "warehouse"])
  searchRadiusKm: number;
  fiscalYearStart?: string;
  quarterlySummitTarget?: number;
  quarterlyPresidentsClubTarget?: number;
  soundEffectsEnabled?: boolean;
  notificationsEnabled?: boolean;
  appointmentRemindersEnabled?: boolean;
  motivationRemindersEnabled?: boolean;
  organizationId?: string; // Links this profile to a company
  clerkUserId?: string; // Clerk User ID for auth and E2E encryption
  jobType?: string; // Links profile to a role for industry recommendations
}

export interface Organization {
  id: string;
  name: string;
  adminUserIds: string[];
  memberUserIds: string[];
  defaultTargets: DailyTargets;
  defaultIndustries?: string[]; // Custom company target industries
  achievementConfig?: any; // Custom badges or toggles
  logoUrl?: string;
}

export interface OrgMember {
  userId: string;
  role: 'admin' | 'manager' | 'rep';
  managedGoals: boolean;
}

export interface AchievementBadge {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progressText: string;
  progressPercent: number;
  timeframe: 'weekly' | 'quarterly' | 'yearly' | 'lifetime';
}

export interface TodoItem {
  id: string;
  text: string;
  notes?: string;
  dueDate?: string; // YYYY-MM-DD
  period: 'day' | 'week' | 'later';
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
  leadId?: string; // Optional linked lead ID
  leadName?: string; // Cached lead name for display
  createdAt: number;
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
const DB_VERSION = 5; // Incremented version to support organizations store

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

        // Todos store
        if (!db.objectStoreNames.contains('todos')) {
          const todosStore = db.createObjectStore('todos', { keyPath: 'id' });
          todosStore.createIndex('dueDate', 'dueDate', { unique: false });
          todosStore.createIndex('leadId', 'leadId', { unique: false });
        }

        // Organizations store
        if (!db.objectStoreNames.contains('organizations')) {
          db.createObjectStore('organizations', { keyPath: 'id' });
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

  // --- Encryption Helpers ---
  private async getEncryptionKeyHelper(): Promise<CryptoKey | null> {
    try {
      const profile = await this.getProfile();
      return await getEncryptionKey(profile.clerkUserId || undefined);
    } catch {
      return null;
    }
  }

  private async encryptLead(lead: Lead, key: CryptoKey): Promise<Lead> {
    const encrypted = { ...lead };
    if (lead.notes) encrypted.notes = await encryptField(lead.notes, key);
    if (lead.decisionMaker) encrypted.decisionMaker = await encryptField(lead.decisionMaker, key);
    if (lead.gatekeeper) encrypted.gatekeeper = await encryptField(lead.gatekeeper, key);
    if (lead.phone) encrypted.phone = await encryptField(lead.phone, key);
    if (lead.quotes && lead.quotes.length > 0) {
      encrypted.quotes = await Promise.all(lead.quotes.map(async q => ({
        ...q,
        description: q.description ? await encryptField(q.description, key) : q.description
      })));
    }
    return encrypted;
  }

  private async decryptLead(lead: Lead, key: CryptoKey): Promise<Lead> {
    const decrypted = { ...lead };
    try {
      if (lead.notes && lead.notes.startsWith('ey')) {
        decrypted.notes = await decryptField(lead.notes, key);
      }
    } catch {
      // fallback
    }
    try {
      if (lead.decisionMaker && lead.decisionMaker.startsWith('ey')) {
        decrypted.decisionMaker = await decryptField(lead.decisionMaker, key);
      }
    } catch {
      // fallback
    }
    try {
      if (lead.gatekeeper && lead.gatekeeper.startsWith('ey')) {
        decrypted.gatekeeper = await decryptField(lead.gatekeeper, key);
      }
    } catch {
      // fallback
    }
    try {
      if (lead.phone && lead.phone.startsWith('ey')) {
        decrypted.phone = await decryptField(lead.phone, key);
      }
    } catch {
      // fallback
    }
    if (lead.quotes && lead.quotes.length > 0) {
      decrypted.quotes = await Promise.all(lead.quotes.map(async q => {
        const decQ = { ...q };
        try {
          if (q.description && q.description.startsWith('ey')) {
            decQ.description = await decryptField(q.description, key);
          }
        } catch {
          // fallback
        }
        return decQ;
      }));
    }
    return decrypted;
  }

  private async encryptVisit(visit: Visit, key: CryptoKey): Promise<Visit> {
    const encrypted = { ...visit };
    if (visit.notes) encrypted.notes = await encryptField(visit.notes, key);
    if (visit.spokeWith) encrypted.spokeWith = await encryptField(visit.spokeWith, key);
    return encrypted;
  }

  private async decryptVisit(visit: Visit, key: CryptoKey): Promise<Visit> {
    const decrypted = { ...visit };
    try {
      if (visit.notes && visit.notes.startsWith('ey')) {
        decrypted.notes = await decryptField(visit.notes, key);
      }
    } catch {
      // fallback
    }
    try {
      if (visit.spokeWith && visit.spokeWith.startsWith('ey')) {
        decrypted.spokeWith = await decryptField(visit.spokeWith, key);
      }
    } catch {
      // fallback
    }
    return decrypted;
  }

  private async encryptCall(call: Call, key: CryptoKey): Promise<Call> {
    const encrypted = { ...call };
    if (call.notes) encrypted.notes = await encryptField(call.notes, key);
    return encrypted;
  }

  private async decryptCall(call: Call, key: CryptoKey): Promise<Call> {
    const decrypted = { ...call };
    try {
      if (call.notes && call.notes.startsWith('ey')) {
        decrypted.notes = await decryptField(call.notes, key);
      }
    } catch {
      // fallback
    }
    return decrypted;
  }

  // --- Organization CRUD ---
  async getOrganization(id: string): Promise<Organization | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('organizations', 'readonly');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async saveOrganization(org: Organization): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('organizations', 'readwrite');
        const request = store.put(org);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
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
              quarterlyPresidentsClubTarget: 12000,
              soundEffectsEnabled: true,
              notificationsEnabled: false,
              appointmentRemindersEnabled: true,
              motivationRemindersEnabled: true,
              jobType: 'General Commercial Representative'
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
    const rawLead: Lead | null = await new Promise((resolve, reject) => {
      try {
        const store = this.getStore('leads', 'readonly');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
    if (!rawLead) return null;
    const key = await this.getEncryptionKeyHelper();
    return key ? this.decryptLead(rawLead, key) : rawLead;
  }

  async saveLead(lead: Lead): Promise<void> {
    await this.init();
    const key = await this.getEncryptionKeyHelper();
    const finalLead = key ? await this.encryptLead(lead, key) : lead;
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('leads', 'readwrite');
        const request = store.put(finalLead);
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
    const rawLeads: Lead[] = await new Promise((resolve, reject) => {
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
    const key = await this.getEncryptionKeyHelper();
    if (!key) return rawLeads;
    return Promise.all(rawLeads.map(l => this.decryptLead(l, key)));
  }

  async getAllLeads(): Promise<Lead[]> {
    await this.init();
    const rawLeads: Lead[] = await new Promise((resolve, reject) => {
      try {
        const store = this.getStore('leads', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
    const key = await this.getEncryptionKeyHelper();
    if (!key) return rawLeads;
    return Promise.all(rawLeads.map(l => this.decryptLead(l, key)));
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
    const key = await this.getEncryptionKeyHelper();
    const finalVisit = key ? await this.encryptVisit(visit, key) : visit;
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('visits', 'readwrite');
        const request = store.put(finalVisit);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getVisitsForLead(leadId: string): Promise<Visit[]> {
    await this.init();
    const rawVisits: Visit[] = await new Promise((resolve, reject) => {
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
    const key = await this.getEncryptionKeyHelper();
    if (!key) return rawVisits;
    return Promise.all(rawVisits.map(v => this.decryptVisit(v, key)));
  }

  async getAllVisits(): Promise<Visit[]> {
    await this.init();
    const rawVisits: Visit[] = await new Promise((resolve, reject) => {
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
    const key = await this.getEncryptionKeyHelper();
    if (!key) return rawVisits;
    return Promise.all(rawVisits.map(v => this.decryptVisit(v, key)));
  }

  // --- Calls CRUD ---
  async addCall(call: Call): Promise<void> {
    await this.init();
    const key = await this.getEncryptionKeyHelper();
    const finalCall = key ? await this.encryptCall(call, key) : call;
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('calls', 'readwrite');
        const request = store.put(finalCall);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async getCallsForLead(leadId: string): Promise<Call[]> {
    await this.init();
    const rawCalls: Call[] = await new Promise((resolve, reject) => {
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
    const key = await this.getEncryptionKeyHelper();
    if (!key) return rawCalls;
    return Promise.all(rawCalls.map(c => this.decryptCall(c, key)));
  }

  async getAllCalls(): Promise<Call[]> {
    await this.init();
    const rawCalls: Call[] = await new Promise((resolve, reject) => {
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
    const key = await this.getEncryptionKeyHelper();
    if (!key) return rawCalls;
    return Promise.all(rawCalls.map(c => this.decryptCall(c, key)));
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

  // --- Todos CRUD ---
  async getTodos(): Promise<TodoItem[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('todos', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => {
          const list = request.result || [];
          list.sort((a, b) => b.createdAt - a.createdAt);
          resolve(list);
        };
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async saveTodo(todo: TodoItem): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('todos', 'readwrite');
        const request = store.put(todo);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async deleteTodo(id: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore('todos', 'readwrite');
        const request = store.delete(id);
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
      const stores = ['profile', 'leads', 'decisions', 'visits', 'calls', 'weekly_plans', 'emails', 'todos'];
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
          quarterlyPresidentsClubTarget: 12000,
          soundEffectsEnabled: true,
          notificationsEnabled: false,
          appointmentRemindersEnabled: true,
          motivationRemindersEnabled: true
        };
        this.saveProfile(defaultProfile).then(() => resolve());
      };

      transaction.onerror = () => reject(transaction.error);
    });
  }

  // --- Target & Badge achievement tracking helpers ---
  
  async checkAchievementsBeforeActivity(): Promise<{
    dailyOsvMetBefore: boolean;
    weeklyOsvMetBefore: boolean;
    weeklyApptMetBefore: boolean;
    dailyOsvTarget: number;
    weeklyOsvTarget: number;
    weeklyApptTarget: number;
  }> {
    const now = new Date();
    const currentWeekId = getWeekId(now);
    const plan = await this.getWeeklyPlan(currentWeekId);
    
    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);
    const todayStartTs = todayStart.getTime();
    const mondayStartTs = plan.startDate;
    
    const allVisits = await this.getAllVisits();
    const allCalls = await this.getAllCalls();
    
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
      
    const osvTodayBefore = allVisits.filter(v => v.timestamp >= todayStartTs).length;
    const osvWeekBefore = allVisits.filter(v => v.timestamp >= mondayStartTs).length;
    
    const apptsFromVisitsWeekBefore = allVisits.filter(v => v.timestamp >= mondayStartTs && v.outcome === 'appointment_set').length;
    const apptsFromCallsWeekBefore = allCalls.filter(c => c.timestamp >= mondayStartTs && c.outcome === 'appointment_set').length;
    const apptsWeekBefore = apptsFromVisitsWeekBefore + apptsFromCallsWeekBefore;
    
    return {
      dailyOsvMetBefore: dailyOsvTarget > 0 && osvTodayBefore >= dailyOsvTarget,
      weeklyOsvMetBefore: weeklyOsvTarget > 0 && osvWeekBefore >= weeklyOsvTarget,
      weeklyApptMetBefore: weeklyApptTarget > 0 && apptsWeekBefore >= weeklyApptTarget,
      dailyOsvTarget,
      weeklyOsvTarget,
      weeklyApptTarget
    };
  }

  async getProfileBadges(profile: Profile, timeframe: 'weekly' | 'quarterly' | 'yearly' | 'lifetime' = 'lifetime'): Promise<AchievementBadge[]> {
    const allVisits = await this.getAllVisits();
    const allCalls = await this.getAllCalls();
    const allLeads = await this.getAllLeads();

    const now = new Date();
    const monday = getMonday(now).getTime();
    
    // Quarter boundaries logic (simplified for mockup, 3 months each)
    const currentMonth = now.getMonth();
    const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
    const quarterStart = new Date(now.getFullYear(), quarterStartMonth, 1).getTime();
    
    // Year boundary
    const yearStart = new Date(now.getFullYear(), 0, 1).getTime();

    // Filter data based on timeframe
    const filterByTime = (timestamp: number) => {
      if (timeframe === 'weekly') return timestamp >= monday;
      if (timeframe === 'quarterly') return timestamp >= quarterStart;
      if (timeframe === 'yearly') return timestamp >= yearStart;
      return true; // lifetime
    };

    const visits = allVisits.filter(v => filterByTime(v.timestamp));
    const calls = allCalls.filter(c => filterByTime(c.timestamp));
    
    // For leads, we'll check addedAt or just lifetime based on requirement
    // Usually dealmaker metrics are based on when it was sold, but we'll approximate with `addedAt` for this mockup if needed,
    // or just use visits/calls timestamps. Let's use `addedAt` for sold leads.
    const leads = allLeads.filter(l => filterByTime(l.addedAt));

    // Weekly metrics
    const weeklyVisitsCount = visits.length;
    const weeklyCallsCount = calls.length;
    const weeklyHustlerUnlocked = weeklyVisitsCount >= 20;
    const weeklyDialerUnlocked = weeklyCallsCount >= 100;

    // Daily peaks (mostly relevant for lifetime/yearly, but we can compute it for the filtered data)
    const visitsByDate: { [date: string]: number } = {};
    visits.forEach(v => {
      const dateStr = new Date(v.timestamp).toISOString().split('T')[0];
      visitsByDate[dateStr] = (visitsByDate[dateStr] || 0) + 1;
    });
    const maxVisitsInADay = Object.keys(visitsByDate).length > 0 ? Math.max(...Object.values(visitsByDate)) : 0;
    const pacesetterUnlocked = maxVisitsInADay >= 10;
    
    const callsByDate: { [date: string]: number } = {};
    calls.forEach(c => {
      const dateStr = new Date(c.timestamp).toISOString().split('T')[0];
      callsByDate[dateStr] = (callsByDate[dateStr] || 0) + 1;
    });
    const maxCallsInADay = Object.keys(callsByDate).length > 0 ? Math.max(...Object.values(callsByDate)) : 0;
    const callCrusaderUnlocked = maxCallsInADay >= 50;

    // Secured first sold account
    const soldLeads = leads.filter(l => l.status === 'sold');
    const closerUnlocked = soldLeads.length >= 1;
    
    // Total Sales Value
    const totalSalesValue = soldLeads.reduce((sum, l) => sum + (l.dealValue || 0), 0);
    const dealmakerUnlocked = totalSalesValue >= 5000;
    
    // Scout
    const totalLeadsCount = leads.length;
    const scoutUnlocked = totalLeadsCount >= 100;
    
    // Targets
    const summitTarget = profile.quarterlySummitTarget || 9000;
    const summitUnlocked = totalSalesValue >= summitTarget;
    
    const presClubTarget = profile.quarterlyPresidentsClubTarget || 12000;
    const presClubUnlocked = totalSalesValue >= presClubTarget;

    const yearlyTarget = presClubTarget * 4;
    const yearlyUnlocked = totalSalesValue >= yearlyTarget;

    const badges: AchievementBadge[] = [
      {
        id: 'weekly_hustler',
        title: 'Weekly Hustler',
        description: 'Complete 20 visits in a single week',
        icon: '🚀',
        unlocked: weeklyHustlerUnlocked,
        progressText: `${weeklyVisitsCount}/20 visits`,
        progressPercent: Math.min(100, Math.round((weeklyVisitsCount / 20) * 100)),
        timeframe: 'weekly'
      },
      {
        id: 'weekly_dialer',
        title: 'Weekly Dialer',
        description: 'Make 100 calls in a single week',
        icon: '📱',
        unlocked: weeklyDialerUnlocked,
        progressText: `${weeklyCallsCount}/100 calls`,
        progressPercent: Math.min(100, Math.round((weeklyCallsCount / 100) * 100)),
        timeframe: 'weekly'
      },
      {
        id: 'pacesetter',
        title: 'Pacesetter',
        description: 'Complete 10 On-Site Visits in a single day',
        icon: '🏃',
        unlocked: pacesetterUnlocked,
        progressText: `${maxVisitsInADay}/10 visits`,
        progressPercent: Math.min(100, Math.round((maxVisitsInADay / 10) * 100)),
        timeframe: 'lifetime'
      },
      {
        id: 'call_crusader',
        title: 'Cold Call Crusader',
        description: 'Log 50 phone calls in a single day',
        icon: '📞',
        unlocked: callCrusaderUnlocked,
        progressText: `${maxCallsInADay}/50 calls`,
        progressPercent: Math.min(100, Math.round((maxCallsInADay / 50) * 100)),
        timeframe: 'lifetime'
      },
      {
        id: 'closer',
        title: 'Closer',
        description: 'Secure your first Sold account',
        icon: '🤝',
        unlocked: closerUnlocked,
        progressText: closerUnlocked ? 'Unlocked!' : '0/1 sold',
        progressPercent: closerUnlocked ? 100 : 0,
        timeframe: 'lifetime'
      },
      {
        id: 'dealmaker_elite',
        title: 'Dealmaker Elite',
        description: 'Reach $5,000 in total sales revenue',
        icon: '💎',
        unlocked: dealmakerUnlocked,
        progressText: `$${totalSalesValue.toLocaleString()}/$5,000`,
        progressPercent: Math.min(100, Math.round((totalSalesValue / 5000) * 100)),
        timeframe: 'lifetime'
      },
      {
        id: 'radar_scout',
        title: 'Radar Scout',
        description: 'Add 100 prospects to your pipeline',
        icon: '📡',
        unlocked: scoutUnlocked,
        progressText: `${totalLeadsCount}/100 prospects`,
        progressPercent: Math.min(100, Math.round((totalLeadsCount / 100) * 100)),
        timeframe: 'lifetime'
      },
      {
        id: 'summit_achiever',
        title: 'Summit Club',
        description: 'Exceed the quarterly Summit sales target',
        icon: '🏆',
        unlocked: summitUnlocked,
        progressText: `$${totalSalesValue.toLocaleString()}/$${summitTarget.toLocaleString()}`,
        progressPercent: Math.min(100, Math.round((totalSalesValue / summitTarget) * 100)),
        timeframe: 'quarterly'
      },
      {
        id: 'presidents_club',
        title: 'Presidents Club',
        description: 'Exceed the quarterly Presidents Club sales target',
        icon: '👑',
        unlocked: presClubUnlocked,
        progressText: `$${totalSalesValue.toLocaleString()}/$${presClubTarget.toLocaleString()}`,
        progressPercent: Math.min(100, Math.round((totalSalesValue / presClubTarget) * 100)),
        timeframe: 'quarterly'
      },
      {
        id: 'yearly_titan',
        title: 'Titan of the Year',
        description: 'Exceed the yearly sales target',
        icon: '🌍',
        unlocked: yearlyUnlocked,
        progressText: `$${totalSalesValue.toLocaleString()}/$${yearlyTarget.toLocaleString()}`,
        progressPercent: Math.min(100, Math.round((totalSalesValue / yearlyTarget) * 100)),
        timeframe: 'yearly'
      }
    ];

    // Always return lifetime badges if timeframe is lifetime, otherwise return only badges matching the timeframe
    return timeframe === 'lifetime' 
      ? badges.filter(b => b.timeframe === 'lifetime')
      : badges.filter(b => b.timeframe === timeframe);
  }
}

// Global singleton window wrapper to ensure perfect singleton resolution across Vite imports / HMR evaluations
if (!(window as any).__dbServiceInstance) {
  (window as any).__dbServiceInstance = new SalesFlowDB();
}
export const dbService: SalesFlowDB = (window as any).__dbServiceInstance;
