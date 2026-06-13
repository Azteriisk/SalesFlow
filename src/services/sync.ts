import { dbService } from './db';
import type { Visit } from './db';

const LAST_SYNC_KEY = 'salesflow_last_sync_timestamp';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export function getLastSyncedTime(): string {
  const ts = localStorage.getItem(LAST_SYNC_KEY);
  if (!ts) return 'Never';
  return new Date(parseInt(ts, 10)).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export async function syncDataWithCloud(): Promise<{ success: boolean; pulledCount: number }> {
  console.log('Syncing offline data with cloud...');
  
  // Return a promise that resolves after 1.5 seconds to simulate network latency
  return new Promise(async (resolve) => {
    try {
      const allLeads = await dbService.getAllLeads();
      const allVisits = await dbService.getAllVisits();
      const allCalls = await dbService.getAllCalls();

      // Scaffolding: Here we would send POST /api/sync with all local leads/visits/calls
      console.log(`Sync payload prepared: ${allLeads.length} leads, ${allVisits.length} visits, ${allCalls.length} calls.`);
      
      setTimeout(async () => {
        let pulledCount = 0;

        // Mock pulling down team updates from other users working the same accounts
        // We will scan our active leads and append a mock sync note from another team member to one of them
        const activeLeads = allLeads.filter(l => l.status !== 'never_visit' && l.status !== 'no_value');
        
        if (activeLeads.length > 0) {
          // Choose one lead to simulate a pull update
          const leadToUpdate = activeLeads[0];
          
          // Only add the sync note once
          const syncIdentifier = '[Team Sync Update]';
          if (leadToUpdate.notes && !leadToUpdate.notes.includes(syncIdentifier)) {
            leadToUpdate.notes = `${syncIdentifier} Rep Sarah visited this account yesterday: spoke to DM Brandon, uniforms contract expires in October. Keep following up. \n\n${leadToUpdate.notes}`;
            await dbService.saveLead(leadToUpdate);
            
            // Add a mock visit log from Sarah for detailed audit trail
            const teamVisit: Visit = {
              id: `team-sync-${Date.now()}`,
              leadId: leadToUpdate.id,
              timestamp: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
              outcome: 'phone_block',
              spokeWith: 'Sarah (Team Rep)',
              isDecisionMaker: false,
              notes: 'Account shared: Uniforms contract expires in October. DM Brandon is interested.'
            };
            await dbService.addVisit(teamVisit);
            pulledCount++;
          }
        }

        // Save last sync timestamp
        localStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
        resolve({ success: true, pulledCount });
      }, 1500);

    } catch (err) {
      console.error('Data synchronization failed:', err);
      resolve({ success: false, pulledCount: 0 });
    }
  });
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
