import { dbService, getWeekId } from './db';
import type { Lead, Visit, Call, TodoItem, WeeklyPlan, Profile, Organization, RecommendationDecision, EmailLog } from './db';
import { getSupabase, isSupabaseConfigured } from './supabase';

const LAST_SYNC_KEY = 'salesflow_last_sync_timestamp';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export function getLastSyncedTime(): string {
  const ts = localStorage.getItem(LAST_SYNC_KEY);
  if (!ts) return 'Never';
  return new Date(parseInt(ts, 10)).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  error?: string;
}

// ---- Supabase row mappers (camelCase <-> snake_case) ----

function leadToRow(lead: Lead, clerkUserId: string) {
  return {
    id: lead.id,
    clerk_user_id: clerkUserId,
    name: lead.name,
    address: lead.address,
    phone: lead.phone || null,
    website: lead.website || null,
    latitude: lead.latitude,
    longitude: lead.longitude,
    category: lead.category,
    status: lead.status,
    notes: lead.notes || null,
    gatekeeper: lead.gatekeeper || null,
    decision_maker: lead.decisionMaker || null,
    snooze_until: lead.snoozeUntil || null,
    added_at: lead.addedAt,
    deal_value: lead.dealValue || null,
    quotes: JSON.stringify(lead.quotes || []),
    updated_at: new Date().toISOString(),
  };
}

function rowToLead(row: Record<string, unknown>): Lead {
  return {
    id: row.id as string,
    name: row.name as string,
    address: row.address as string,
    phone: (row.phone as string) || undefined,
    website: (row.website as string) || undefined,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    category: row.category as string,
    status: row.status as Lead['status'],
    notes: (row.notes as string) || undefined,
    gatekeeper: (row.gatekeeper as string) || undefined,
    decisionMaker: (row.decision_maker as string) || undefined,
    snoozeUntil: (row.snooze_until as number) || undefined,
    addedAt: row.added_at as number,
    dealValue: (row.deal_value as number) || undefined,
    quotes: typeof row.quotes === 'string' ? JSON.parse(row.quotes) : (row.quotes as Lead['quotes']) || [],
  };
}

function visitToRow(visit: Visit, clerkUserId: string) {
  return {
    id: visit.id,
    clerk_user_id: clerkUserId,
    lead_id: visit.leadId,
    timestamp: visit.timestamp,
    outcome: visit.outcome,
    spoke_with: visit.spokeWith || null,
    is_decision_maker: visit.isDecisionMaker,
    notes: visit.notes,
    images: JSON.stringify(visit.images || []),
    updated_at: new Date().toISOString(),
  };
}

function rowToVisit(row: Record<string, unknown>): Visit {
  return {
    id: row.id as string,
    leadId: row.lead_id as string,
    timestamp: row.timestamp as number,
    outcome: row.outcome as Visit['outcome'],
    spokeWith: (row.spoke_with as string) || undefined,
    isDecisionMaker: row.is_decision_maker as boolean,
    notes: row.notes as string,
    images: typeof row.images === 'string' ? JSON.parse(row.images) : (row.images as string[]) || [],
  };
}

function callToRow(call: Call, clerkUserId: string) {
  return {
    id: call.id,
    clerk_user_id: clerkUserId,
    lead_id: call.leadId,
    timestamp: call.timestamp,
    outcome: call.outcome,
    notes: call.notes,
    images: JSON.stringify(call.images || []),
    updated_at: new Date().toISOString(),
  };
}

function rowToCall(row: Record<string, unknown>): Call {
  return {
    id: row.id as string,
    leadId: row.lead_id as string,
    timestamp: row.timestamp as number,
    outcome: row.outcome as Call['outcome'],
    notes: row.notes as string,
    images: typeof row.images === 'string' ? JSON.parse(row.images) : (row.images as string[]) || [],
  };
}

function todoToRow(todo: TodoItem, clerkUserId: string) {
  return {
    id: todo.id,
    clerk_user_id: clerkUserId,
    text: todo.text,
    notes: todo.notes || null,
    due_date: todo.dueDate || null,
    period: todo.period,
    priority: todo.priority,
    completed: todo.completed,
    lead_id: todo.leadId || null,
    lead_name: todo.leadName || null,
    created_at: todo.createdAt,
    updated_at: new Date().toISOString(),
  };
}

function rowToTodo(row: Record<string, unknown>): TodoItem {
  return {
    id: row.id as string,
    text: row.text as string,
    notes: (row.notes as string) || undefined,
    dueDate: (row.due_date as string) || undefined,
    period: row.period as TodoItem['period'],
    priority: row.priority as TodoItem['priority'],
    completed: row.completed as boolean,
    leadId: (row.lead_id as string) || undefined,
    leadName: (row.lead_name as string) || undefined,
    createdAt: row.created_at as number,
  };
}

function weeklyPlanToRow(plan: WeeklyPlan, clerkUserId: string) {
  return {
    id: plan.id,
    clerk_user_id: clerkUserId,
    start_date: plan.startDate,
    targets: JSON.stringify(plan.targets),
    updated_at: new Date().toISOString(),
  };
}

function rowToWeeklyPlan(row: Record<string, unknown>): WeeklyPlan {
  return {
    id: row.id as string,
    startDate: row.start_date as number,
    targets: typeof row.targets === 'string' ? JSON.parse(row.targets) : row.targets as WeeklyPlan['targets'],
  };
}

function decisionToRow(decision: RecommendationDecision, clerkUserId: string) {
  return {
    place_id: decision.placeId,
    clerk_user_id: clerkUserId,
    status: decision.status,
    decided_at: decision.decidedAt,
    category: decision.category || null,
    rating: decision.rating || null,
    user_ratings_total: decision.userRatingsTotal || null,
    updated_at: new Date().toISOString(),
  };
}

function rowToDecision(row: Record<string, unknown>): RecommendationDecision {
  return {
    placeId: row.place_id as string,
    status: row.status as RecommendationDecision['status'],
    decidedAt: row.decided_at as number,
    category: (row.category as string) || undefined,
    rating: (row.rating as number) || undefined,
    userRatingsTotal: (row.user_ratings_total as number) || undefined,
  };
}

function emailToRow(email: EmailLog, clerkUserId: string) {
  return {
    id: email.id,
    clerk_user_id: clerkUserId,
    lead_id: email.leadId,
    timestamp: email.timestamp,
    subject: email.subject,
    body: email.body,
    outcome: email.outcome,
    updated_at: new Date().toISOString(),
  };
}

function rowToEmail(row: Record<string, unknown>): EmailLog {
  return {
    id: row.id as string,
    leadId: row.lead_id as string,
    timestamp: row.timestamp as number,
    subject: row.subject as string,
    body: row.body as string,
    outcome: row.outcome as EmailLog['outcome'],
  };
}

function profileToRow(profile: Profile) {
  return {
    clerk_user_id: profile.clerkUserId || profile.id,
    rep_name: profile.repName,
    industry_filters: JSON.stringify(profile.industryFilters),
    search_radius_km: profile.searchRadiusKm,
    fiscal_year_start: profile.fiscalYearStart || null,
    quarterly_summit_target: profile.quarterlySummitTarget || null,
    quarterly_presidents_club_target: profile.quarterlyPresidentsClubTarget || null,
    sound_effects_enabled: profile.soundEffectsEnabled ?? true,
    notifications_enabled: profile.notificationsEnabled ?? false,
    appointment_reminders_enabled: profile.appointmentRemindersEnabled ?? false,
    motivation_reminders_enabled: profile.motivationRemindersEnabled ?? false,
    organization_id: profile.organizationId || null,
    job_type: profile.jobType || null,
    company_name: profile.companyName || null,
    categories: JSON.stringify(profile.categories || []),
    calling_script: profile.callingScript || null,
    personal_achievements: JSON.stringify(profile.personalAchievements || []),
    updated_at: new Date().toISOString(),
  };
}

function rowToProfile(row: Record<string, unknown>): Partial<Profile> {
  return {
    repName: row.rep_name as string,
    industryFilters: typeof row.industry_filters === 'string' ? JSON.parse(row.industry_filters) : (row.industry_filters as string[]),
    searchRadiusKm: row.search_radius_km as number,
    fiscalYearStart: (row.fiscal_year_start as string) || undefined,
    quarterlySummitTarget: (row.quarterly_summit_target as number) || undefined,
    quarterlyPresidentsClubTarget: (row.quarterly_presidents_club_target as number) || undefined,
    soundEffectsEnabled: row.sound_effects_enabled as boolean,
    notificationsEnabled: row.notifications_enabled as boolean,
    appointmentRemindersEnabled: row.appointment_reminders_enabled as boolean,
    motivationRemindersEnabled: row.motivation_reminders_enabled as boolean,
    organizationId: (row.organization_id as string) || undefined,
    clerkUserId: row.clerk_user_id as string,
    jobType: (row.job_type as string) || undefined,
    companyName: (row.company_name as string) || undefined,
    categories: typeof row.categories === 'string' ? JSON.parse(row.categories) : (row.categories as Profile['categories']),
    callingScript: (row.calling_script as string) || undefined,
    personalAchievements: row.personal_achievements ? (typeof row.personal_achievements === 'string' ? JSON.parse(row.personal_achievements) : row.personal_achievements as Profile['personalAchievements']) : [],
  };
}

function orgToRow(org: Organization) {
  return {
    id: org.id,
    name: org.name,
    admin_user_ids: JSON.stringify(org.adminUserIds),
    member_user_ids: JSON.stringify(org.memberUserIds),
    default_targets: JSON.stringify(org.defaultTargets),
    default_industries: JSON.stringify(org.defaultIndustries || []),
    achievement_config: org.achievementConfig ? JSON.stringify(org.achievementConfig) : null,
    custom_achievements: JSON.stringify(org.customAchievements || []),
    logo_url: org.logoUrl || null,
    updated_at: new Date().toISOString(),
  };
}

function rowToOrg(row: Record<string, unknown>): Organization {
  return {
    id: row.id as string,
    name: row.name as string,
    adminUserIds: typeof row.admin_user_ids === 'string' ? JSON.parse(row.admin_user_ids) : (row.admin_user_ids as string[]),
    memberUserIds: typeof row.member_user_ids === 'string' ? JSON.parse(row.member_user_ids) : (row.member_user_ids as string[]),
    defaultTargets: typeof row.default_targets === 'string' ? JSON.parse(row.default_targets) : row.default_targets as Organization['defaultTargets'],
    defaultIndustries: typeof row.default_industries === 'string' ? JSON.parse(row.default_industries) : (row.default_industries as string[]),
    achievementConfig: row.achievement_config ? (typeof row.achievement_config === 'string' ? JSON.parse(row.achievement_config) : row.achievement_config) : undefined,
    customAchievements: typeof row.custom_achievements === 'string' ? JSON.parse(row.custom_achievements) : (row.custom_achievements as Organization['customAchievements']),
    logoUrl: (row.logo_url as string) || undefined,
  };
}

// ---- Main sync function ----

export async function syncDataWithCloud(): Promise<SyncResult> {
  if (!isSupabaseConfigured()) {
    console.warn('Supabase not configured. Simulating sync.');
    localStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
    return { success: true, pushed: 0, pulled: 0 };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, pushed: 0, pulled: 0, error: 'Supabase client not available' };
  }

  console.log('[Sync] Starting cloud synchronization...');

  try {
    const profile = await dbService.getProfile();
    const clerkUserId = profile.clerkUserId;
    if (!clerkUserId) {
      console.warn('[Sync] No Clerk user ID found. Cannot sync without user identity.');
      return { success: false, pushed: 0, pulled: 0, error: 'No user identity available' };
    }

    const lastSyncTs = localStorage.getItem(LAST_SYNC_KEY);
    const lastSyncDate = lastSyncTs ? new Date(parseInt(lastSyncTs, 10)).toISOString() : '1970-01-01T00:00:00Z';

    let totalPushed = 0;
    let totalPulled = 0;

    // ---- PUSH PHASE: Upload local data to Supabase ----

    // Push profile
    const profileRow = profileToRow(profile);
    const { error: profileErr } = await supabase.from('profiles').upsert(profileRow, { onConflict: 'clerk_user_id' });
    if (profileErr) console.warn('[Sync] Profile push error:', profileErr.message);
    else totalPushed++;

    // Push leads
    const allLeads = await dbService.getAllLeads();
    if (allLeads.length > 0) {
      const leadRows = allLeads.map(l => leadToRow(l, clerkUserId));
      // Batch upsert in chunks of 100
      for (let i = 0; i < leadRows.length; i += 100) {
        const chunk = leadRows.slice(i, i + 100);
        const { error: leadsErr } = await supabase.from('leads').upsert(chunk, { onConflict: 'id,clerk_user_id' });
        if (leadsErr) console.warn('[Sync] Leads push error:', leadsErr.message);
        else totalPushed += chunk.length;
      }
    }

    // Push visits
    const allVisits = await dbService.getAllVisits();
    if (allVisits.length > 0) {
      const visitRows = allVisits.map(v => visitToRow(v, clerkUserId));
      for (let i = 0; i < visitRows.length; i += 100) {
        const chunk = visitRows.slice(i, i + 100);
        const { error: visitsErr } = await supabase.from('visits').upsert(chunk, { onConflict: 'id,clerk_user_id' });
        if (visitsErr) console.warn('[Sync] Visits push error:', visitsErr.message);
        else totalPushed += chunk.length;
      }
    }

    // Push calls
    const allCalls = await dbService.getAllCalls();
    if (allCalls.length > 0) {
      const callRows = allCalls.map(c => callToRow(c, clerkUserId));
      for (let i = 0; i < callRows.length; i += 100) {
        const chunk = callRows.slice(i, i + 100);
        const { error: callsErr } = await supabase.from('calls').upsert(chunk, { onConflict: 'id,clerk_user_id' });
        if (callsErr) console.warn('[Sync] Calls push error:', callsErr.message);
        else totalPushed += chunk.length;
      }
    }

    // Push todos
    const allTodos = await dbService.getTodos();
    if (allTodos.length > 0) {
      const todoRows = allTodos.map(t => todoToRow(t, clerkUserId));
      for (let i = 0; i < todoRows.length; i += 100) {
        const chunk = todoRows.slice(i, i + 100);
        const { error: todosErr } = await supabase.from('todos').upsert(chunk, { onConflict: 'id,clerk_user_id' });
        if (todosErr) console.warn('[Sync] Todos push error:', todosErr.message);
        else totalPushed += chunk.length;
      }
    }

    // Push weekly plans
    const currentWeekId = getWeekId(new Date());
    const currentPlan = await dbService.getWeeklyPlan(currentWeekId);
    if (currentPlan) {
      const planRow = weeklyPlanToRow(currentPlan, clerkUserId);
      const { error: planErr } = await supabase.from('weekly_plans').upsert(planRow, { onConflict: 'id,clerk_user_id' });
      if (planErr) console.warn('[Sync] Weekly plan push error:', planErr.message);
      else totalPushed++;
    }

    // Push organization (if exists)
    const org = await dbService.getOrganization(profile.organizationId || '');
    if (org) {
      const orgRow = orgToRow(org);
      const { error: orgErr } = await supabase.from('organizations').upsert(orgRow, { onConflict: 'id' });
      if (orgErr) console.warn('[Sync] Organization push error:', orgErr.message);
      else totalPushed++;
    }

    // Push decisions
    const allDecisions = await dbService.getAllDecisions();
    if (allDecisions.length > 0) {
      const decisionRows = allDecisions.map(d => decisionToRow(d, clerkUserId));
      for (let i = 0; i < decisionRows.length; i += 100) {
        const chunk = decisionRows.slice(i, i + 100);
        const { error: decisionsErr } = await supabase.from('decisions').upsert(chunk, { onConflict: 'place_id,clerk_user_id' });
        if (decisionsErr) console.warn('[Sync] Decisions push error:', decisionsErr.message);
        else totalPushed += chunk.length;
      }
    }

    // Push emails
    const allEmails = await dbService.getAllEmails();
    if (allEmails.length > 0) {
      const emailRows = allEmails.map(e => emailToRow(e, clerkUserId));
      for (let i = 0; i < emailRows.length; i += 100) {
        const chunk = emailRows.slice(i, i + 100);
        const { error: emailsErr } = await supabase.from('emails').upsert(chunk, { onConflict: 'id,clerk_user_id' });
        if (emailsErr) console.warn('[Sync] Emails push error:', emailsErr.message);
        else totalPushed += chunk.length;
      }
    }

    console.log(`[Sync] Push complete: ${totalPushed} records uploaded.`);

    // ---- PULL PHASE: Download newer records from Supabase ----

    // Pull leads updated after last sync
    const { data: remoteLeads } = await supabase
      .from('leads')
      .select('*')
      .eq('clerk_user_id', clerkUserId)
      .gt('updated_at', lastSyncDate);

    if (remoteLeads && remoteLeads.length > 0) {
      for (const row of remoteLeads) {
        const lead = rowToLead(row);
        await dbService.saveLead(lead);
        totalPulled++;
      }
    }

    // Pull visits
    const { data: remoteVisits } = await supabase
      .from('visits')
      .select('*')
      .eq('clerk_user_id', clerkUserId)
      .gt('updated_at', lastSyncDate);

    if (remoteVisits && remoteVisits.length > 0) {
      for (const row of remoteVisits) {
        const visit = rowToVisit(row);
        await dbService.addVisit(visit);
        totalPulled++;
      }
    }

    // Pull calls
    const { data: remoteCalls } = await supabase
      .from('calls')
      .select('*')
      .eq('clerk_user_id', clerkUserId)
      .gt('updated_at', lastSyncDate);

    if (remoteCalls && remoteCalls.length > 0) {
      for (const row of remoteCalls) {
        const call = rowToCall(row);
        await dbService.addCall(call);
        totalPulled++;
      }
    }

    // Pull todos
    const { data: remoteTodos } = await supabase
      .from('todos')
      .select('*')
      .eq('clerk_user_id', clerkUserId)
      .gt('updated_at', lastSyncDate);

    if (remoteTodos && remoteTodos.length > 0) {
      for (const row of remoteTodos) {
        const todo = rowToTodo(row);
        await dbService.saveTodo(todo);
        totalPulled++;
      }
    }

    // Pull weekly plans
    const { data: remotePlans } = await supabase
      .from('weekly_plans')
      .select('*')
      .eq('clerk_user_id', clerkUserId)
      .gt('updated_at', lastSyncDate);

    if (remotePlans && remotePlans.length > 0) {
      for (const row of remotePlans) {
        const plan = rowToWeeklyPlan(row);
        await dbService.saveWeeklyPlan(plan);
        totalPulled++;
      }
    }

    // Pull decisions
    const { data: remoteDecisions } = await supabase
      .from('decisions')
      .select('*')
      .eq('clerk_user_id', clerkUserId)
      .gt('updated_at', lastSyncDate);

    if (remoteDecisions && remoteDecisions.length > 0) {
      for (const row of remoteDecisions) {
        const decision = rowToDecision(row);
        await dbService.saveDecision(decision);
        totalPulled++;
      }
    }

    // Pull emails
    const { data: remoteEmails } = await supabase
      .from('emails')
      .select('*')
      .eq('clerk_user_id', clerkUserId)
      .gt('updated_at', lastSyncDate);

    if (remoteEmails && remoteEmails.length > 0) {
      for (const row of remoteEmails) {
        const email = rowToEmail(row);
        await dbService.addEmail(email);
        totalPulled++;
      }
    }

    // Pull profile (merge remote settings into local)
    const { data: remoteProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('clerk_user_id', clerkUserId)
      .gt('updated_at', lastSyncDate)
      .maybeSingle();

    if (remoteProfile) {
      const remoteParts = rowToProfile(remoteProfile);
      const mergedProfile: Profile = { ...profile, ...remoteParts, id: profile.id };
      await dbService.saveProfile(mergedProfile);
      totalPulled++;
    }

    // Pull organization
    if (profile.organizationId) {
      const { data: remoteOrg } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', profile.organizationId)
        .gt('updated_at', lastSyncDate)
        .maybeSingle();

      if (remoteOrg) {
        const org = rowToOrg(remoteOrg);
        await dbService.saveOrganization(org);
        totalPulled++;
      }
    }

    console.log(`[Sync] Pull complete: ${totalPulled} records downloaded.`);

    // Save last sync timestamp
    localStorage.setItem(LAST_SYNC_KEY, Date.now().toString());

    return { success: true, pushed: totalPushed, pulled: totalPulled };

  } catch (err) {
    console.error('[Sync] Data synchronization failed:', err);
    return { success: false, pushed: 0, pulled: 0, error: String(err) };
  }
}

// Legacy compat export
export async function syncDataWithCloudLegacy(): Promise<{ success: boolean; pulledCount: number }> {
  const result = await syncDataWithCloud();
  return { success: result.success, pulledCount: result.pulled };
}

// Scaffolding for registering PWA Background Sync
export async function registerBackgroundSync() {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await (registration as any).sync.register('salesflow-sync');
      console.log('PWA Background Sync manager registered successfully');
    } catch (err) {
      console.warn('PWA Background Sync registration not supported or failed:', err);
    }
  }
}

// Scaffolding for registering PWA Periodic Background Sync
export async function registerPeriodicSync() {
  if ('serviceWorker' in navigator && 'periodicSync' in (navigator as any)) {
    try {
      const registration = await navigator.serviceWorker.ready;
      // Request periodic sync every 12 hours
      await (registration as any).periodicSync.register('salesflow-periodic-sync', {
        minInterval: 12 * 60 * 60 * 1000
      });
      console.log('PWA Periodic Background Sync registered successfully');
    } catch (err) {
      console.warn('PWA Periodic Background Sync registration failed:', err);
    }
  }
}
