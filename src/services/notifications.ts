import { dbService, getWeekId } from './db';

// Keep track of notified items in memory / localStorage to avoid duplicate notifications
const NOTIFIED_KEY = 'salesflow_notified_appointments';
const MOTIVATION_KEY = 'salesflow_last_motivation_date';

function getNotifiedList(): string[] {
  try {
    const data = localStorage.getItem(NOTIFIED_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function addToNotifiedList(id: string) {
  try {
    const list = getNotifiedList();
    if (!list.includes(id)) {
      list.push(id);
      localStorage.setItem(NOTIFIED_KEY, JSON.stringify(list));
    }
  } catch (err) {
    console.error('Failed to update notified list', err);
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notifications');
    return false;
  }
  
  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (err) {
    console.error('Error requesting notification permission', err);
    return false;
  }
}

export async function triggerLocalNotification(title: string, options?: NotificationOptions) {
  try {
    const profile = await dbService.getProfile();
    if (!profile.notificationsEnabled) return;

    if (Notification.permission === 'granted') {
      new Notification(title, {
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        ...options
      });
    }
  } catch (err) {
    console.error('Failed to trigger notification', err);
  }
}

// Check and schedule reminders for appointments 15 mins before they start
export async function checkAndTriggerAppointmentReminders() {
  try {
    const profile = await dbService.getProfile();
    if (!profile.notificationsEnabled || !profile.appointmentRemindersEnabled) return;

    const [allVisits, allCalls, allLeads] = await Promise.all([
      dbService.getAllVisits(),
      dbService.getAllCalls(),
      dbService.getAllLeads()
    ]);

    const leadsMap = new Map(allLeads.map(l => [l.id, l]));
    const notified = getNotifiedList();
    const now = Date.now();

    // Scan visits and calls for appointments
    const appointments: { id: string; leadName: string; time: number }[] = [];

    const apptRegex = /Appointment set for (\d{4}-\d{2}-\d{2}) at (\d{2}:\d{2})/;

    const processNotes = (id: string, leadId: string, notes: string) => {
      const match = notes.match(apptRegex);
      if (match) {
        const dateStr = match[1];
        const timeStr = match[2];
        const apptDate = new Date(`${dateStr}T${timeStr}:00`);
        const apptTime = apptDate.getTime();
        
        // If appointment is in the future and not notified yet
        if (!isNaN(apptTime) && apptTime > now && !notified.includes(id)) {
          const lead = leadsMap.get(leadId);
          appointments.push({
            id,
            leadName: lead?.name || 'Unknown Business',
            time: apptTime
          });
        }
      }
    };

    allVisits.forEach(v => {
      if (v.outcome === 'appointment_set' && v.notes) {
        processNotes(v.id, v.leadId, v.notes);
      }
    });

    allCalls.forEach(c => {
      if (c.outcome === 'appointment_set' && c.notes) {
        processNotes(c.id, c.leadId, c.notes);
      }
    });

    // Check if any appointment is in the 15-minute window (between 13 and 17 minutes from now)
    appointments.forEach(appt => {
      const diffMin = (appt.time - now) / (1000 * 60);
      
      // If it is 13 to 17 minutes away, trigger the notification
      if (diffMin >= 13 && diffMin <= 17) {
        triggerLocalNotification(`Appointment Reminder`, {
          body: `Meeting with ${appt.leadName} starts in 15 minutes!`,
          requireInteraction: true
        });
        addToNotifiedList(appt.id);
      }
    });

  } catch (err) {
    console.error('Failed scanning appointment reminders', err);
  }
}

// EOD Motivation alerts: checks if user is behind daily OSV target around mid-afternoon
export async function checkDailyOsvMotivationAlert() {
  try {
    const profile = await dbService.getProfile();
    if (!profile.notificationsEnabled || !profile.motivationRemindersEnabled) return;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();

    // Trigger motivation alert between 3:30 PM (15:30) and 4:30 PM (16:30)
    if (currentHour === 15 && currentMin >= 30 || currentHour === 16 && currentMin <= 30) {
      const todayStr = now.toISOString().split('T')[0];
      const lastMotivationDate = localStorage.getItem(MOTIVATION_KEY);

      // Only run once per day
      if (lastMotivationDate === todayStr) return;

      const currentWeekId = getWeekId(now);
      const plan = await dbService.getWeeklyPlan(currentWeekId);
      
      const days: ('sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday')[] = [
        'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
      ];
      const currentDay = days[now.getDay()];
      const dailyOsvTarget = plan.targets[currentDay]?.osv ?? 0;

      if (dailyOsvTarget <= 0) return;

      const allVisits = await dbService.getAllVisits();
      
      const todayStart = new Date();
      todayStart.setHours(0,0,0,0);
      const todayStartTs = todayStart.getTime();

      const osvToday = allVisits.filter(v => v.timestamp >= todayStartTs).length;

      if (osvToday < dailyOsvTarget) {
        const remaining = dailyOsvTarget - osvToday;
        triggerLocalNotification(`Daily Goal Motivation`, {
          body: `Keep pushing! You are ${remaining} visit${remaining > 1 ? 's' : ''} away from hitting your daily goal of ${dailyOsvTarget} OSVs. You can do it!`,
          requireInteraction: true
        });
        localStorage.setItem(MOTIVATION_KEY, todayStr);
      }
    }
  } catch (err) {
    console.error('Failed to trigger daily motivation alert', err);
  }
}
