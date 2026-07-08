import React, { useState, useEffect } from 'react';
import { 
  Phone, 
  X, 
  Check, 
  CheckCircle, 
  FileText, 
  PhoneCall, 
  RotateCcw,
  DollarSign,
  Camera,
  Mic,
  MicOff,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { dbService, getWeekId } from '../services/db';
import type { Lead, Call, Visit, LeadStatus, Profile } from '../services/db';
import { triggerConfetti } from '../services/confetti';
import { playSound } from '../services/sound';

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

const PhoneBlock: React.FC = () => {
  const [queue, setQueue] = useState<Lead[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentLead, setCurrentLead] = useState<Lead | null>(null);
  
  // Call log modal states
  const [showDisposition, setShowDisposition] = useState<boolean>(false);
  const [callOutcome, setCallOutcome] = useState<'no_answer' | 'gatekeeper_blocked' | 'spoke_to_dm' | 'appointment_set' | 'sold' | 'no_value' | 'never_visit'>('no_answer');
  const [callNotes, setCallNotes] = useState<string>('');
  const [dealValue, setDealValue] = useState<number>(0);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [goalAchievedModal, setGoalAchievedModal] = useState<string | null>(null);
  
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isScriptOpen, setIsScriptOpen] = useState<boolean>(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const p = await dbService.getProfile();
        setProfile(p);
      } catch (err) {
        console.error('Failed to load profile in PhoneBlock', err);
      }
    };
    loadProfile();
  }, []);

  const toggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice dictation is not supported in this browser. Please use Chrome, Safari, or a native WebView.");
      return;
    }

    if (isListening) {
      // Toggle off logic
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onresult = (event: any) => {
      const speechToText = event.results[0][0].transcript;
      setCallNotes(prev => prev ? `${prev} ${speechToText}` : speechToText);
    };

    recognition.start();
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const compressedList: string[] = [];

    for (const file of files) {
      try {
        const compressed = await compressImage(file);
        compressedList.push(compressed);
      } catch (err) {
        console.error('Error compressing image:', err);
      }
    }

    setAttachedImages(prev => [...prev, ...compressedList]);
    e.target.value = '';
  };

  const handleNativeCameraCapture = async () => {
    try {
      const image = await CapCamera.getPhoto({
        quality: 70,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt
      });
      if (image && image.base64String) {
        const base64Image = `data:image/jpeg;base64,${image.base64String}`;
        setAttachedImages(prev => [...prev, base64Image]);
      }
    } catch (err) {
      console.warn('Native camera capture failed or cancelled:', err);
    }
  };

  const handleRemoveImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };
  
  // Appointment sub-state
  const [apptDate, setApptDate] = useState<string>('');
  const [apptTime, setApptTime] = useState<string>('');

  // Call history records for current lead
  const [leadVisits, setLeadVisits] = useState<Visit[]>([]);
  
  // Drag swipe gesture state
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const activeQueue = await dbService.getLeadsByStatus('phone_block');
      setQueue(activeQueue);
      setCurrentLead(activeQueue[0] || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  // Fetch past activity history for current lead
  useEffect(() => {
    if (!currentLead) return;
    const fetchLeadHistory = async () => {
      const visits = await dbService.getVisitsForLead(currentLead.id);
      setLeadVisits(visits);
    };
    fetchLeadHistory();
  }, [currentLead]);

  // Handle pointer swipe gesture
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (showDisposition || isAnimating) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    setDragStart({ x: e.clientX, y: e.clientY });
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStart || isAnimating) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setDragOffset({ x: dx, y: dy });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || isAnimating) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);

    const threshold = 120;
    const { x } = dragOffset;

    if (x > threshold) {
      // Swipe Right: Open call log modal
      animateAndTrigger('right', () => {
        setShowDisposition(true);
      });
    } else if (x < -threshold) {
      // Swipe Left: Skip and send to tail of the queue
      animateAndTrigger('left', () => {
        handleSkip();
      });
    } else {
      setDragOffset({ x: 0, y: 0 });
    }
    setDragStart(null);
  };

  const animateAndTrigger = (direction: 'left' | 'right', callback: () => void) => {
    setIsAnimating(true);
    setDragOffset({ x: direction === 'left' ? -500 : 500, y: 0 });
    
    setTimeout(() => {
      callback();
      setDragOffset({ x: 0, y: 0 });
      setIsAnimating(false);
    }, 350); // matches transition duration
  };

  const handleSkip = () => {
    playSound('swipe');
    if (queue.length <= 1) return;
    
    // Rotate queue
    const updatedQueue = [...queue];
    const skipped = updatedQueue.shift();
    if (skipped) {
      updatedQueue.push(skipped);
    }
    setQueue(updatedQueue);
    setCurrentLead(updatedQueue[0] || null);
  };

  const triggerSwipeLeft = () => {
    if (isAnimating) return;
    animateAndTrigger('left', () => {
      handleSkip();
    });
  };

  const triggerSwipeRight = () => {
    if (isAnimating) return;
    animateAndTrigger('right', () => {
      setShowDisposition(true);
    });
  };

  const handleLogCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentLead) return;

    let apptDetails = '';
    if (callOutcome === 'appointment_set') {
      apptDetails = `Appointment set for ${apptDate} at ${apptTime}. `;
    } else if (callOutcome === 'sold') {
      apptDetails = `Deal Closed Won for $${dealValue}. `;
    }

    const newCall: Call = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
      leadId: currentLead.id,
      timestamp: Date.now(),
      outcome: callOutcome,
      notes: `${apptDetails}${callNotes}`.trim(),
      images: attachedImages.length > 0 ? attachedImages : undefined
    };

    const achievementsBefore = await dbService.checkAchievementsBeforeActivity();

    // Save Call report
    await dbService.addCall(newCall);

    // Determine new status for Lead
    let newStatus: LeadStatus = 'phone_block';
    
    if (callOutcome === 'appointment_set') {
      newStatus = 'appointment_set';
    } else if (callOutcome === 'sold') {
      newStatus = 'sold';
    } else if (callOutcome === 'never_visit') {
      newStatus = 'never_visit';
    } else if (callOutcome === 'no_value') {
      newStatus = 'no_value';
    }
    // Note: If no_answer or gatekeeper_blocked, status remains 'phone_block'

    const updatedLead: Lead = {
      ...currentLead,
      status: newStatus,
      notes: callNotes || currentLead.notes
    };

    if (callOutcome === 'sold') {
      updatedLead.dealValue = dealValue;
    }

    await dbService.saveLead(updatedLead);

    // Check targets after
    const now = new Date();
    const currentWeekId = getWeekId(now);
    const plan = await dbService.getWeeklyPlan(currentWeekId);
    
    const allVisitsAfter = await dbService.getAllVisits();
    const allCallsAfter = await dbService.getAllCalls();
    
    const weeklyApptTarget = 
      plan.targets.monday.appointments + 
      plan.targets.tuesday.appointments + 
      plan.targets.wednesday.appointments + 
      plan.targets.thursday.appointments + 
      plan.targets.friday.appointments;
      
    const apptsFromVisitsWeekAfter = allVisitsAfter.filter(v => v.timestamp >= plan.startDate && v.outcome === 'appointment_set').length;
    const apptsFromCallsWeekAfter = allCallsAfter.filter(c => c.timestamp >= plan.startDate && c.outcome === 'appointment_set').length;
    const apptsWeekAfter = apptsFromVisitsWeekAfter + apptsFromCallsWeekAfter;

    // Check newly met
    let modalMsg: string | null = null;

    if (!achievementsBefore.weeklyApptMetBefore && weeklyApptTarget > 0 && apptsWeekAfter >= weeklyApptTarget) {
      modalMsg = `🏆 Weekly Presentations Goal Achieved! (${apptsWeekAfter}/${weeklyApptTarget} set)`;
    }

    if (modalMsg) {
      triggerConfetti();
      setGoalAchievedModal(modalMsg);
      setTimeout(() => {
        setGoalAchievedModal(null);
      }, 3500);
    } else {
      playSound('click');
    }

    // Close Modal
    setShowDisposition(false);
    setCallNotes('');
    setCallOutcome('no_answer');
    setDealValue(0);
    setAttachedImages([]);

    // Remove from active queue if status changed, otherwise move to tail of queue
    const updatedQueue = [...queue];
    updatedQueue.shift(); // remove current

    if (newStatus === 'phone_block') {
      // Re-queue for later in this session
      updatedQueue.push(updatedLead);
    }

    setQueue(updatedQueue);
    setCurrentLead(updatedQueue[0] || null);
  };

  // Card transform styling calculation
  const getCardStyle = () => {
    let transitionStyle = '';
    if (isAnimating) {
      transitionStyle = 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s ease-in-out';
    } else if (!isDragging && dragOffset.x === 0) {
      transitionStyle = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    }

    const rotate = (dragOffset.x / 20).toFixed(2);
    const opacity = isAnimating ? 0 : 1;

    return {
      transition: transitionStyle,
      transform: `translateX(${dragOffset.x}px) rotate(${rotate}deg)`,
      opacity
    };
  };

  const getStampOpacity = (type: 'confirm' | 'skip') => {
    const maxOffset = 100;
    if (type === 'confirm' && dragOffset.x > 0) {
      return Math.min(dragOffset.x / maxOffset, 1);
    }
    if (type === 'skip' && dragOffset.x < 0) {
      return Math.min(Math.abs(dragOffset.x) / maxOffset, 1);
    }
    return 0;
  };

  if (loading) {
    return (
      <div className="leaflet-placeholder">
        <Phone className="animate-bounce" style={{ width: '40px', height: '40px', stroke: '#818cf8' }} />
        <p>Loading call list queue...</p>
      </div>
    );
  }

  if (!currentLead) {
    return (
      <div className="empty-state">
        <PhoneCall style={{ stroke: '#818cf8' }} />
        <h3>Call Block Completed!</h3>
        <p>There are no leads remaining in your Phone Block queue.</p>
        <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', marginTop: '0.4rem' }}>
          💡 When you complete On-Site Visits, select **Next Step: Add to Phone Block** to populate this list.
        </span>
      </div>
    );
  }

  return (
    <div className="phone-block-container">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', textAlign: 'center', marginBottom: '1rem' }}>
        <h2 style={{ fontFamily: 'Outfit', fontSize: '1.4rem' }}>Phone Calling Block</h2>
        <span style={{ fontSize: '0.82rem', color: 'hsl(var(--text-secondary))' }}>
          Focused power-dialing session ({queue.length} left in block)
        </span>
      </div>

      {profile?.callingScript && (
        <div style={{
          background: 'hsla(var(--primary-glow) / 0.1)',
          border: '1px solid hsla(var(--primary) / 0.25)',
          borderRadius: '12px',
          padding: '0.65rem 0.85rem',
          marginBottom: '1rem',
          width: '100%',
          maxWidth: '380px',
          margin: '0 auto 1rem',
          boxSizing: 'border-box'
        }}>
          <button 
            type="button"
            onClick={() => setIsScriptOpen(!isScriptOpen)}
            style={{
              background: 'transparent',
              border: 'none',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              color: 'hsl(var(--text-primary))',
              fontWeight: 600,
              fontSize: '0.85rem',
              padding: 0
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              📜 Active Calling Script Reference
            </span>
            {isScriptOpen ? <ChevronUp style={{ width: '16px', height: '16px' }} /> : <ChevronDown style={{ width: '16px', height: '16px' }} />}
          </button>
          
          {isScriptOpen && (
            <div style={{ 
              marginTop: '0.5rem', 
              fontSize: '0.8rem', 
              lineHeight: 1.4, 
              color: 'hsl(var(--text-secondary))',
              whiteSpace: 'pre-wrap',
              maxHeight: '180px',
              overflowY: 'auto',
              borderTop: '1px solid hsla(var(--primary) / 0.15)',
              paddingTop: '0.5rem',
              textAlign: 'left'
            }}>
              {profile.callingScript}
            </div>
          )}
        </div>
      )}

      <div className="dialer-swiper-deck">
        {/* Next card in stack (static/background card) */}
        {queue.length > 1 && (
          <div 
            className="dialer-card background-card"
            style={{ 
              transform: 'scale(0.95) translateY(10px)', 
              opacity: 0.6, 
              zIndex: 1,
              pointerEvents: 'none',
              position: 'absolute'
            }}
          >
            <div className="dialer-card-header">
              <h3 className="dialer-lead-name">{queue[1].name}</h3>
              <span className="dialer-contact-detail">📍 {queue[1].address}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem' }}>
              <span style={{ fontWeight: 600, color: 'hsl(var(--text-secondary))' }}>FUNNEL DETAILS</span>
              {queue[1].decisionMaker && <span><strong>Decision Maker:</strong> {queue[1].decisionMaker}</span>}
              {queue[1].gatekeeper && <span><strong>Gatekeeper:</strong> {queue[1].gatekeeper}</span>}
            </div>
          </div>
        )}

        {/* Current active card */}
        <div 
          className="dialer-card"
          style={{
            ...getCardStyle(),
            zIndex: 2
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Stamps */}
          <div className="swipe-stamp like" style={{ opacity: getStampOpacity('confirm'), right: '1.5rem', top: '1.5rem' }}>Log Call</div>
          <div className="swipe-stamp nope" style={{ opacity: getStampOpacity('skip'), left: '1.5rem', top: '1.5rem' }}>Skip</div>

          {/* Business Details */}
          <div className="dialer-card-header">
            <h3 className="dialer-lead-name">{currentLead.name}</h3>
            <span className="dialer-contact-detail">📍 {currentLead.address}</span>
            {currentLead.phone && (
              <a href={`tel:${currentLead.phone}`} className="phone-action-btn" style={{ pointerEvents: isDragging ? 'none' : 'auto' }}>
                <PhoneCall style={{ width: '15px', height: '15px' }} />
                <span>Call {currentLead.phone}</span>
              </a>
            )}
          </div>

          {/* Lead notes history info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem' }}>
            <span style={{ fontWeight: 600, color: 'hsl(var(--text-secondary))' }}>FUNNEL DETAILS</span>
            {currentLead.decisionMaker && (
              <span><strong>Decision Maker:</strong> {currentLead.decisionMaker}</span>
            )}
            {currentLead.gatekeeper && (
              <span><strong>Gatekeeper:</strong> {currentLead.gatekeeper}</span>
            )}
          </div>

          {/* Past visit/call notes for context */}
          <div className="dialer-history-section">
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'hsl(var(--text-muted))', display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.4rem' }}>
              <FileText style={{ width: '12px', height: '12px' }} /> PAST VISIT LOGS
            </span>
            {leadVisits.length === 0 ? (
              <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>No visit records found.</p>
            ) : (
              leadVisits.slice(0, 3).map(v => (
                <div key={v.id} className="history-item">
                  <div className="history-date">Visit: {new Date(v.timestamp).toLocaleDateString()}</div>
                  <div className="history-notes">{v.notes || 'Logged visit with no notes.'}</div>
                  {v.images && v.images.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.35rem', overflowX: 'auto', paddingBottom: '0.2rem' }}>
                      {v.images.map((img, idx) => (
                        <img 
                          key={idx} 
                          src={img} 
                          alt="Visit attachment" 
                          onClick={() => setLightboxImage(img)}
                          style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover', cursor: 'pointer', border: '1px solid hsl(var(--border-muted))', flexShrink: 0 }} 
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Manual buttons */}
      <div className="swipe-controls" style={{ marginTop: '0.5rem' }}>
        <button 
          className="circle-btn nope-btn"
          title="Skip Lead (Put at back of queue)"
          onClick={triggerSwipeLeft}
        >
          <RotateCcw style={{ transform: 'scaleX(-1)' }} />
        </button>

        <button 
          className="circle-btn like-btn"
          title="Log Call Outcome"
          onClick={triggerSwipeRight}
        >
          <Check />
        </button>
      </div>

      <div className="swipe-help-text">
        <span>◀ Swipe Left to Skip / Re-queue</span>
        <span>Swipe Right to Log Call ▶</span>
      </div>

      {/* Call Disposition Logging Modal */}
      {showDisposition && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ display: 'flex', justifySelf: 'flex-end', width: '100%' }}>
              <button 
                style={{ background: 'transparent', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer', marginLeft: 'auto' }}
                onClick={() => { setShowDisposition(false); setAttachedImages([]); }}
              >
                <X />
              </button>
            </div>
            
            <h3 className="modal-title" style={{ fontFamily: 'Outfit' }}>Log Call: {currentLead.name}</h3>
            
            <form onSubmit={handleLogCall} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label>Call Outcome</label>
                <div className="radio-group" style={{ gridTemplateColumns: '1fr' }}>
                  <div 
                    className={`radio-card ${callOutcome === 'no_answer' ? 'active' : ''}`}
                    onClick={() => setCallOutcome('no_answer')}
                  >
                    <span className="radio-card-title">Voicemail / No Answer</span>
                  </div>

                  <div 
                    className={`radio-card ${callOutcome === 'gatekeeper_blocked' ? 'active' : ''}`}
                    onClick={() => setCallOutcome('gatekeeper_blocked')}
                  >
                    <span className="radio-card-title">Blocked by Gatekeeper</span>
                  </div>

                  <div 
                    className={`radio-card ${callOutcome === 'appointment_set' ? 'active' : ''}`}
                    onClick={() => setCallOutcome('appointment_set')}
                  >
                    <span className="radio-card-title">Appointment Set!</span>
                  </div>

                  <div 
                    className={`radio-card ${callOutcome === 'sold' ? 'active' : ''}`}
                    onClick={() => setCallOutcome('sold')}
                  >
                    <span className="radio-card-title" style={{ color: 'hsl(var(--success))' }}>Sold / Closed Won!</span>
                  </div>

                  <div 
                    className={`radio-card ${callOutcome === 'no_value' ? 'active' : ''}`}
                    onClick={() => setCallOutcome('no_value')}
                  >
                    <span className="radio-card-title">No Value (Keep in Funnel)</span>
                  </div>

                  <div 
                    className={`radio-card ${callOutcome === 'never_visit' ? 'active' : ''}`}
                    onClick={() => setCallOutcome('never_visit')}
                  >
                    <span className="radio-card-title" style={{ color: 'hsl(var(--danger))' }}>Never Call/Visit (Blacklist)</span>
                  </div>
                </div>
              </div>

              {/* Conditional Inputs */}
              {callOutcome === 'appointment_set' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: 'hsl(var(--bg-tertiary) / 0.5)', padding: '0.75rem', borderRadius: '8px' }}>
                  <div className="form-group">
                    <label>Appt Date</label>
                    <input 
                      type="date" 
                      required
                      className="form-control"
                      value={apptDate}
                      onChange={(e) => setApptDate(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Time</label>
                    <input 
                      type="time" 
                      required
                      className="form-control"
                      value={apptTime}
                      onChange={(e) => setApptTime(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {callOutcome === 'sold' && (
                <div className="form-group" style={{ background: 'hsl(var(--bg-tertiary) / 0.5)', padding: '0.75rem', borderRadius: '8px' }}>
                  <label>Deal Contract Value ($ / month or year)</label>
                  <div style={{ position: 'relative' }}>
                    <DollarSign style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: 'hsl(var(--text-muted))' }} />
                    <input 
                      type="number" 
                      required
                      min={1}
                      className="form-control"
                      placeholder="e.g. 1500"
                      style={{ paddingLeft: '32px' }}
                      value={dealValue}
                      onChange={(e) => setDealValue(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
              )}

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <label style={{ margin: 0 }}>Call Notes / Disposition</label>
                  <button
                    type="button"
                    onClick={toggleListening}
                    style={{
                      background: isListening ? 'hsl(var(--error) / 0.15)' : 'hsla(var(--primary) / 0.15)',
                      border: isListening ? '1px solid hsl(var(--error))' : '1px solid hsla(var(--primary) / 0.4)',
                      borderRadius: '16px',
                      color: isListening ? 'hsl(var(--error))' : 'hsl(var(--primary))',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      padding: '0.2rem 0.65rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      transition: 'all 0.2s'
                    }}
                  >
                    {isListening ? (
                      <>
                        <MicOff style={{ width: '12px', height: '12px', color: 'hsl(var(--error))' }} />
                        Stop Listening
                      </>
                    ) : (
                      <>
                        <Mic style={{ width: '12px', height: '12px', color: 'hsl(var(--primary))' }} />
                        Dictate Notes
                      </>
                    )}
                  </button>
                </div>
                <textarea 
                  className="form-control"
                  rows={3}
                  required
                  placeholder="e.g. Spoke to gatekeeper Sarah. Owner Bob is out until next Monday. Re-queued for next week..."
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                />
              </div>

              {/* Image Attachment Section */}
              <div className="form-group">
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Attach Images</span>
                  <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>Optional</span>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {Capacitor.isNativePlatform() ? (
                    <button 
                      type="button"
                      onClick={handleNativeCameraCapture}
                      className="btn-secondary"
                      style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        gap: '0.4rem', 
                        padding: '0.45rem 0.75rem', 
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        width: 'fit-content',
                        borderRadius: '6px',
                        border: '1px solid hsl(var(--border-muted))',
                        background: 'hsl(var(--bg-tertiary))',
                        color: 'hsl(var(--text-primary))'
                      }}
                    >
                      <Camera style={{ width: '15px', height: '15px' }} />
                      Add Photo
                    </button>
                  ) : (
                    <label className="btn-secondary" style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      gap: '0.4rem', 
                      padding: '0.45rem 0.75rem', 
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      width: 'fit-content',
                      borderRadius: '6px',
                      border: '1px solid hsl(var(--border-muted))',
                      background: 'hsl(var(--bg-tertiary))'
                    }}>
                      <Camera style={{ width: '15px', height: '15px' }} />
                      Add Photo
                      <input 
                        type="file" 
                        accept="image/*" 
                        multiple 
                        onChange={handleImageChange} 
                        style={{ display: 'none' }} 
                      />
                    </label>
                  )}
                  
                  {attachedImages.length > 0 && (
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', 
                      gap: '0.5rem',
                      marginTop: '0.25rem' 
                    }}>
                      {attachedImages.map((img, idx) => (
                        <div key={idx} style={{ position: 'relative', width: '60px', height: '60px', borderRadius: '6px', overflow: 'hidden', border: '1px solid hsl(var(--border-muted))' }}>
                          <img src={img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Preview" />
                          <button 
                            type="button" 
                            onClick={() => handleRemoveImage(idx)}
                            style={{
                              position: 'absolute',
                              top: '2px',
                              right: '2px',
                              background: 'rgba(0,0,0,0.6)',
                              border: 'none',
                              borderRadius: '50%',
                              width: '16px',
                              height: '16px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              cursor: 'pointer',
                              padding: 0
                            }}
                          >
                            <X style={{ width: '10px', height: '10px' }} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button type="submit" className="btn-primary">
                <CheckCircle style={{ width: '16px', height: '16px' }} />
                Save Call Disposition
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Full-Screen Lightbox Modal */}
      {lightboxImage && (
        <div 
          className="modal-overlay" 
          style={{ 
            zIndex: 1000, 
            background: 'rgba(0,0,0,0.85)', 
            backdropFilter: 'blur(8px)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            position: 'fixed',
            inset: 0
          }}
          onClick={() => setLightboxImage(null)}
        >
          <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%', display: 'flex', flexDirection: 'column', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
            <button 
              type="button" 
              onClick={() => setLightboxImage(null)}
              style={{
                alignSelf: 'flex-end',
                background: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: '1rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                marginBottom: '0.5rem',
                fontWeight: 600
              }}
            >
              <X style={{ width: '20px', height: '20px' }} />
              <span>Close</span>
            </button>
            <img 
              src={lightboxImage} 
              alt="Expanded view" 
              style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: '8px', border: '2px solid hsl(var(--border-muted))', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} 
            />
          </div>
        </div>
      )}

      {goalAchievedModal && (
        <div 
          className="modal-overlay" 
          style={{ 
            zIndex: 10000, 
            background: 'rgba(0,0,0,0.75)', 
            backdropFilter: 'blur(10px)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            position: 'fixed',
            inset: 0
          }}
        >
          <div 
            className="glass-card" 
            style={{ 
              width: '90%', 
              maxWidth: '400px', 
              padding: '2.5rem 2rem', 
              textAlign: 'center', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              gap: '1rem',
              animation: 'scaleUp 0.3s ease-out',
              border: '2px solid hsl(var(--primary))',
              boxShadow: '0 10px 40px rgba(142, 192, 124, 0.25)',
              position: 'relative'
            }}
          >
            <div style={{ fontSize: '3.5rem', animation: 'bounce-slow 2s infinite ease-in-out' }}>🎉</div>
            <h3 style={{ fontFamily: 'Outfit', fontSize: '1.5rem', color: 'hsl(var(--primary))', margin: 0 }}>
              Goal Achieved!
            </h3>
            <p style={{ fontSize: '1.05rem', color: 'hsl(var(--text-secondary))', margin: 0, fontWeight: 500, lineHeight: '1.4' }}>
              {goalAchievedModal}
            </p>
            <button 
              className="btn-primary" 
              onClick={() => setGoalAchievedModal(null)}
              style={{ marginTop: '0.75rem', width: '100%', maxWidth: '140px', padding: '0.5rem 1rem' }}
            >
              Awesome
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhoneBlock;
