import React, { useState, useEffect, useRef } from 'react';
import { Flame, Check, X, Ban, Compass, AlertCircle, MapPin, Phone, Globe } from 'lucide-react';
import { dbService } from '../services/db';
import type { Lead, Profile, RecommendationDecision } from '../services/db';
import { searchNearbyPlaces, getPlaceDetails } from '../services/places';
import type { PlaceResult } from '../services/places';

// --- Machine Learning & Recommendation Algorithm Helpers ---

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const deg2rad = (deg: number) => deg * (Math.PI / 180);
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface AlgoPreferences {
  categoryAffinities: { [key: string]: number };
  avgLikedRating: number;
  avgLikedReviewCount: number;
  hasHistory: boolean;
}

function calculateAlgoPreferences(decisions: RecommendationDecision[]): AlgoPreferences {
  const prefs: AlgoPreferences = {
    categoryAffinities: {},
    avgLikedRating: 4.0,
    avgLikedReviewCount: 50,
    hasHistory: false
  };

  const categoryLikes: { [key: string]: number } = {};
  const categoryTotals: { [key: string]: number } = {};
  let ratingSum = 0;
  let ratingCount = 0;
  let reviewCountSum = 0;
  let reviewCountCount = 0;

  decisions.forEach(d => {
    if (!d.category) return;
    prefs.hasHistory = true;

    const cat = d.category;
    categoryTotals[cat] = (categoryTotals[cat] || 0) + 1;
    if (d.status === 'liked') {
      categoryLikes[cat] = (categoryLikes[cat] || 0) + 1;
    }

    if (d.status === 'liked') {
      if (d.rating !== undefined && d.rating !== null) {
        ratingSum += d.rating;
        ratingCount++;
      }
      if (d.userRatingsTotal !== undefined && d.userRatingsTotal !== null) {
        reviewCountSum += d.userRatingsTotal;
        reviewCountCount++;
      }
    }
  });

  Object.keys(categoryTotals).forEach(cat => {
    const total = categoryTotals[cat];
    const likes = categoryLikes[cat] || 0;
    prefs.categoryAffinities[cat] = likes / total;
  });

  if (ratingCount > 0) {
    prefs.avgLikedRating = ratingSum / ratingCount;
  }
  if (reviewCountCount > 0) {
    prefs.avgLikedReviewCount = reviewCountSum / reviewCountCount;
  }

  return prefs;
}

function scoreCandidate(candidate: PlaceResult, prefs: AlgoPreferences, distanceKm: number): number {
  let score = 0;

  // 1. Category Affinity (Weight: 40%)
  const cat = candidate.types[0] || 'business';
  const affinity = prefs.categoryAffinities[cat] !== undefined ? prefs.categoryAffinities[cat] : 0.5;
  score += affinity * 40;

  // 2. Rating Proximity (Weight: 20%)
  if (candidate.rating !== undefined) {
    const diff = Math.abs(candidate.rating - prefs.avgLikedRating);
    const ratingScore = Math.max(0, 1 - diff / 5.0);
    score += ratingScore * 20;
  } else {
    score += 0.5 * 20;
  }

  // 3. Review Count Proximity (Weight: 20%)
  if (candidate.userRatingsTotal !== undefined) {
    const candidateLog = Math.log10(candidate.userRatingsTotal + 1);
    const prefLog = Math.log10(prefs.avgLikedReviewCount + 1);
    const diff = Math.abs(candidateLog - prefLog);
    const reviewScore = Math.max(0, 1 - diff / 3.0);
    score += reviewScore * 20;
  } else {
    score += 0.5 * 20;
  }

  // 4. Distance Decay (Weight: 20%)
  // Score decreases as distance increases. Full points at 0km, down to 0 at 40km.
  const distanceScore = Math.max(0, 1 - distanceKm / 40.0);
  score += distanceScore * 20;

  // Base score boost for highly rated establishments if no history
  if (!prefs.hasHistory) {
    const ratingBonus = candidate.rating ? (candidate.rating / 5.0) * 10 : 5;
    score = score * 0.9 + ratingBonus;
  }

  // Bound score between 50 and 99 for premium feeling Match %
  return Math.min(99, Math.max(50, score));
}

interface DiscoverSwiperProps {
  location: { latitude: number; longitude: number };
  profile: Profile;
}

const DiscoverSwiper: React.FC<DiscoverSwiperProps> = ({ location, profile }) => {
  const [candidates, setCandidates] = useState<PlaceResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Swipe gesture state
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Drawer state
  const [selectedCandidate, setSelectedCandidate] = useState<PlaceResult | null>(null);
  const [drawerDetails, setDrawerDetails] = useState<Partial<PlaceResult> | null>(null);
  const [drawerLoading, setDrawerLoading] = useState<boolean>(false);

  const handleCardClick = async (candidate: PlaceResult) => {
    setSelectedCandidate(candidate);
    setDrawerLoading(true);
    setDrawerDetails(null);
    try {
      const details = await getPlaceDetails(candidate.id, candidate.name, candidate.types);
      setDrawerDetails(details);
    } catch (err) {
      console.error('Failed to load candidate details', err);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleDrawerDecision = async (status: 'liked' | 'disliked_irrelevant' | 'never_visit') => {
    setSelectedCandidate(null);
    await handleDecision(status);
  };

  // Load candidates on mount or location/profile changes
  useEffect(() => {
    const fetchProspects = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch existing leads and decisions to filter duplicates
        const [existingLeads, decisions] = await Promise.all([
          dbService.getAllLeads(),
          dbService.getAllDecisions()
        ]);

        const excludedIds = new Set([
          ...existingLeads.map(l => l.id),
          ...decisions.map(d => d.placeId)
        ]);

        // Query places nearby
        const rawPlaces = await searchNearbyPlaces(
          location.latitude,
          location.longitude,
          profile.searchRadiusKm,
          profile.industryFilters
        );

        // Filter out places already swiped or imported
        const filtered = rawPlaces.filter(p => !excludedIds.has(p.id));
        
        // Calculate algorithm preferences from past decisions
        const prefs = calculateAlgoPreferences(decisions);

        // Map candidates to include distance, score, and explanation
        const scored = filtered.map(p => {
          const dist = getDistanceKm(location.latitude, location.longitude, p.latitude, p.longitude);
          const score = scoreCandidate(p, prefs, dist);
          
          // Generate match explanations
          const explanations: string[] = [];
          const catLabel = p.types[0]?.replace(/_/g, ' ') || 'prospect';
          explanations.push(`Fits your ${catLabel} filter`);
          
          if (dist < 3) {
            explanations.push('Extremely close (< 3km away)');
          } else if (dist < 10) {
            explanations.push('Within convenient driving radius');
          }
          
          if (p.rating && p.rating >= prefs.avgLikedRating - 0.2) {
            explanations.push(`High rating (${p.rating.toFixed(1)}) aligns with your liked prospects`);
          }

          if (p.userRatingsTotal && p.userRatingsTotal > prefs.avgLikedReviewCount * 0.5) {
            explanations.push('Strong customer review base');
          } else {
            explanations.push('Hidden gem with low review competition');
          }

          return {
            ...p,
            distanceKm: dist,
            matchScore: Math.round(score),
            matchReasons: explanations
          };
        });

        // Sort by match score DESC
        scored.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
        
        setCandidates(scored);
        setCurrentIndex(0);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to fetch nearby prospects.');
      } finally {
        setLoading(false);
      }
    };

    fetchProspects();
  }, [location, profile]);

  const activeCard = candidates[currentIndex] || null;

  // Gesture handling
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isAnimating) return;
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

    const threshold = 120; // swipe threshold in pixels
    const { x, y } = dragOffset;

    if (x > threshold) {
      // Swipe Right (Add to OSV)
      animateAndTrigger('liked', 500, y);
    } else if (x < -threshold) {
      // Swipe Left (Skip / Irrelevant)
      animateAndTrigger('disliked_irrelevant', -500, y);
    } else if (y > threshold) {
      // Swipe Down (Never Visit)
      animateAndTrigger('never_visit', x, 600);
    } else {
      // Reset back to center
      setDragOffset({ x: 0, y: 0 });
      if (Math.abs(x) < 8 && Math.abs(y) < 8 && activeCard) {
        handleCardClick(activeCard);
      }
    }
    setDragStart(null);
  };

  const animateAndTrigger = (status: 'liked' | 'disliked_irrelevant' | 'never_visit', targetX: number, targetY: number) => {
    setIsAnimating(true);
    setDragOffset({ x: targetX, y: targetY });
    
    setTimeout(async () => {
      await handleDecision(status);
      setDragOffset({ x: 0, y: 0 });
      setIsAnimating(false);
    }, 350); // matches transition time
  };

  const handleDecision = async (status: 'liked' | 'disliked_irrelevant' | 'never_visit') => {
    if (!activeCard) return;

    // Capture decided card reference
    const decidedCard = activeCard;

    // Move to next card immediately in the UI
    setCurrentIndex(prev => prev + 1);

    // Run database and API calls asynchronously in the background
    (async () => {
      try {
        // Log the swipe decision to DB
        await dbService.saveDecision({
          placeId: decidedCard.id,
          status,
          decidedAt: Date.now(),
          category: decidedCard.types[0] || 'business',
          rating: decidedCard.rating,
          userRatingsTotal: decidedCard.userRatingsTotal
        });

        // If swiped right, import details and add to Pending OSVs
        if (status === 'liked') {
          let phone = '';
          let website = '';
          let address = decidedCard.address;
          
          try {
            // Fetch detailed phone and website via Google API
            const details = await getPlaceDetails(decidedCard.id, decidedCard.name, decidedCard.types);
            if (details.phone) phone = details.phone;
            if (details.website) website = details.website;
            if (details.address) address = details.address;
          } catch (err) {
            console.warn('Could not fetch candidate details in background', err);
          }

          const newLead: Lead = {
            id: decidedCard.id,
            name: decidedCard.name,
            address,
            phone,
            website,
            latitude: decidedCard.latitude,
            longitude: decidedCard.longitude,
            category: decidedCard.types[0] || 'business',
            status: 'pending_osv',
            addedAt: Date.now()
          };
          await dbService.saveLead(newLead);
        }
      } catch (err) {
        console.error('Error saving decision in background:', err);
      }
    })();
  };

  // Button triggers (simulate swipes)
  const triggerSwipe = (status: 'liked' | 'disliked_irrelevant' | 'never_visit') => {
    if (!activeCard || isAnimating) return;
    
    const offset = status === 'liked' ? 500 : status === 'disliked_irrelevant' ? -500 : 0;
    const yOffset = status === 'never_visit' ? 600 : 0;
    
    animateAndTrigger(status, offset, yOffset);
  };

  // Card transform styling calculation
  const getCardStyle = () => {
    let transitionStyle = '';
    if (isAnimating) {
      transitionStyle = 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s ease-in-out';
    } else if (!isDragging && dragOffset.x === 0 && dragOffset.y === 0) {
      transitionStyle = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    }

    const rotate = (dragOffset.x / 20).toFixed(2);
    const opacity = isAnimating ? 0 : 1;

    return {
      transition: transitionStyle,
      transform: `translate(${dragOffset.x}px, ${dragOffset.y}px) rotate(${rotate}deg)`,
      opacity
    };
  };

  // Calculate stamp opacity
  const getStampOpacity = (type: 'like' | 'nope' | 'never') => {
    const maxOffset = 100;
    if (type === 'like' && dragOffset.x > 0) {
      return Math.min(dragOffset.x / maxOffset, 1);
    }
    if (type === 'nope' && dragOffset.x < 0) {
      return Math.min(Math.abs(dragOffset.x) / maxOffset, 1);
    }
    if (type === 'never' && dragOffset.y > 0 && Math.abs(dragOffset.x) < 40) {
      return Math.min(dragOffset.y / maxOffset, 1);
    }
    return 0;
  };

  if (loading) {
    return (
      <div className="leaflet-placeholder">
        <Compass className="animate-spin" style={{ width: '40px', height: '40px', stroke: '#818cf8', animation: 'spin 2s linear infinite' }} />
        <p>Scanning territory for leads...</p>
        <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>Searching inside {profile.searchRadiusKm}km radius</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <AlertCircle style={{ color: 'hsl(var(--danger))' }} />
        <h3>Lead Discovery Failed</h3>
        <p>{error}</p>
        <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>Verify your Google API key inside `.env`</span>
      </div>
    );
  }

  if (!activeCard) {
    return (
      <div className="empty-state">
        <Flame style={{ stroke: '#818cf8' }} />
        <h3>All Caught Up!</h3>
        <p>No new potential businesses found in this area.</p>
        <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.82rem' }}>
          <span>💡 Try expanding your **Search Radius** in Settings.</span>
          <span>💡 Verify you have selected the appropriate **Target Categories**.</span>
        </div>
      </div>
    );
  }

  // Fallback image based on place category if photoUrl is missing
  const getFallbackImage = (types: string[]) => {
    if (types.includes('car_repair')) {
      return 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?q=80&w=400&auto=format&fit=crop';
    }
    if (types.includes('restaurant')) {
      return 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=400&auto=format&fit=crop';
    }
    if (types.includes('warehouse') || types.includes('storage')) {
      return 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=400&auto=format&fit=crop';
    }
    return 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=400&auto=format&fit=crop';
  };

  return (
    <div className="swipe-screen-container">
      <h2 style={{ fontFamily: 'Outfit', fontSize: '1.25rem', marginBottom: '1rem', textAlign: 'center' }}>
        Discover prospects
      </h2>

      {/* Discover Swiper Deck */}
      <div className="swiper-deck">
        {/* Next card in stack (static/background card) */}
        {currentIndex + 1 < candidates.length && (
          <div 
            key={candidates[currentIndex + 1].id}
            className="swipe-card background-card"
            style={{ 
              transform: 'scale(0.95) translateY(10px)', 
              opacity: 0.6, 
              zIndex: 1,
              pointerEvents: 'none',
              position: 'absolute'
            }}
          >
            {/* Business Image */}
            <div 
              className="swipe-card-image"
              style={{ backgroundImage: `url(${candidates[currentIndex + 1].photoUrl || getFallbackImage(candidates[currentIndex + 1].types)})` }}
            >
              <div className="swipe-card-gradient" />
              {candidates[currentIndex + 1].matchScore && (
                <div 
                  className="swipe-card-category"
                  style={{
                    left: 'auto',
                    right: '1.25rem',
                    background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 800,
                    opacity: 0.8
                  }}
                >
                  {candidates[currentIndex + 1].matchScore}% Match
                </div>
              )}
            </div>
            {/* Details */}
            <div className="swipe-card-details">
              <h3>{candidates[currentIndex + 1].name}</h3>
              <div className="swipe-card-address">
                <span>📍 {candidates[currentIndex + 1].address}</span>
              </div>
            </div>
          </div>
        )}

        {/* Current active card */}
        {activeCard && (
          <div 
            key={activeCard.id}
            ref={cardRef}
            className="swipe-card" 
            style={{
              ...getCardStyle(),
              zIndex: 2
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {/* Stamps */}
            <div className="swipe-stamp like" style={{ opacity: getStampOpacity('like') }}>OSV List</div>
            <div className="swipe-stamp nope" style={{ opacity: getStampOpacity('nope') }}>Skip</div>
            <div className="swipe-stamp never" style={{ opacity: getStampOpacity('never') }}>Never Visit</div>

            {/* Business Image */}
            <div 
              className="swipe-card-image"
              style={{ backgroundImage: `url(${activeCard.photoUrl || getFallbackImage(activeCard.types)})` }}
            >
              <div className="swipe-card-gradient" />
              <div className="swipe-card-category">
                {activeCard.types[0]?.replace('_', ' ') || 'Prospect'}
              </div>
              {activeCard.matchScore && (
                <div 
                  className="swipe-card-category"
                  style={{
                    left: 'auto',
                    right: '1.25rem',
                    background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 800
                  }}
                >
                  {activeCard.matchScore}% Match
                </div>
              )}
            </div>

            {/* Details */}
            <div className="swipe-card-details">
              <h3>{activeCard.name}</h3>
              
              {activeCard.rating && (
                <div className="rating-row">
                  ★ {activeCard.rating.toFixed(1)} 
                  <span>({activeCard.userRatingsTotal} reviews)</span>
                </div>
              )}

              <div className="swipe-card-address">
                <span>📍 {activeCard.address}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Button controls */}
      <div className="swipe-controls">
        <button 
          className="circle-btn nope-btn" 
          title="Swipe Left: Skip Lead"
          onClick={() => triggerSwipe('disliked_irrelevant')}
        >
          <X />
        </button>

        <button 
          className="circle-btn never-btn" 
          title="Swipe Down: Never Visit"
          onClick={() => triggerSwipe('never_visit')}
        >
          <Ban />
        </button>

        <button 
          className="circle-btn like-btn" 
          title="Swipe Right: Add to OSV List"
          onClick={() => triggerSwipe('liked')}
        >
          <Check />
        </button>
      </div>

      {/* Interactive Helper Text */}
      <div className="swipe-help-text">
        <span>◀ Swipe Left to Skip</span>
        <span>▼ Swipe Down to Blacklist</span>
        <span>Swipe Right to Add ▶</span>
      </div>

      {/* Detail Drawer */}
      {selectedCandidate && (
        <div className="drawer-backdrop" onClick={() => setSelectedCandidate(null)}>
          <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3 style={{ fontFamily: 'Outfit', fontSize: '1.2rem' }}>Prospect Profile</h3>
              <button className="close-btn" onClick={() => setSelectedCandidate(null)}>
                <X style={{ width: '22px', height: '22px' }} />
              </button>
            </div>

            <div className="drawer-body">
              {/* Core Business Details */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <h2 style={{ fontSize: '1.3rem', fontFamily: 'Outfit', color: 'hsl(var(--text-primary))' }}>
                  {selectedCandidate.name}
                </h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <span className="lead-action-badge pending_osv" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>
                    {selectedCandidate.types[0]?.replace(/_/g, ' ') || 'Prospect'}
                  </span>
                  {selectedCandidate.rating && (
                    <span style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem', color: 'hsl(var(--warning))', fontWeight: 600 }}>
                      ★ {selectedCandidate.rating.toFixed(1)} ({selectedCandidate.userRatingsTotal || 0} reviews)
                    </span>
                  )}
                </div>
                
                <hr style={{ borderColor: 'hsl(var(--border-muted))', borderStyle: 'solid', borderWidth: '1px 0 0 0', margin: '0.5rem 0' }} />

                <div style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                    <MapPin style={{ width: '15px', height: '15px', flexShrink: 0, marginTop: '2px', color: 'hsl(var(--primary))' }} /> 
                    <span>{selectedCandidate.address}</span>
                  </span>
                  
                  {drawerLoading ? (
                    <span style={{ color: 'hsl(var(--text-muted))', fontStyle: 'italic', fontSize: '0.8rem' }}>Loading additional details...</span>
                  ) : (
                    <>
                      {drawerDetails?.phone && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Phone style={{ width: '15px', height: '15px', color: 'hsl(var(--primary))' }} /> 
                          <a href={`tel:${drawerDetails.phone}`} style={{ color: 'hsl(var(--text-primary))', textDecoration: 'none' }}>
                            {drawerDetails.phone}
                          </a>
                        </span>
                      )}
                      
                      {drawerDetails?.website && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Globe style={{ width: '15px', height: '15px', color: 'hsl(var(--primary))' }} /> 
                          <a href={drawerDetails.website} target="_blank" rel="noreferrer" style={{ color: 'hsl(var(--secondary))', textDecoration: 'none' }}>
                            Visit Website
                          </a>
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Match Insights */}
              {selectedCandidate.matchScore && (
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'hsl(var(--bg-tertiary) / 0.3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: '0.9rem', color: 'hsl(var(--secondary))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Personalized Match Insight
                    </span>
                    <span style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))', color: '#fff', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800 }}>
                      {selectedCandidate.matchScore}% Match
                    </span>
                  </div>
                  
                  {selectedCandidate.matchReasons && selectedCandidate.matchReasons.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.8rem', color: 'hsl(var(--text-secondary))', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {selectedCandidate.matchReasons.map((reason, idx) => (
                        <li key={idx}>{reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <span style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))', fontStyle: 'italic' }}>
                      Swipe to build up your personal targeting profile.
                    </span>
                  )}
                </div>
              )}

              {/* Action Buttons in Drawer */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <button 
                  className="btn-primary" 
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem', fontSize: '0.85rem', background: 'hsl(var(--success))', borderColor: 'hsl(var(--success))' }}
                  onClick={() => handleDrawerDecision('liked')}
                >
                  <Check style={{ width: '16px', height: '16px' }} />
                  Add to OSV
                </button>
                <button 
                  className="btn-secondary" 
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem', fontSize: '0.85rem' }}
                  onClick={() => handleDrawerDecision('disliked_irrelevant')}
                >
                  <X style={{ width: '16px', height: '16px' }} />
                  Skip Lead
                </button>
                <button 
                  className="btn-secondary" 
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem', fontSize: '0.85rem', color: 'hsl(var(--warning))', borderColor: 'hsl(var(--warning) / 0.3)', gridColumn: '1 / -1' }}
                  onClick={() => handleDrawerDecision('never_visit')}
                >
                  <Ban style={{ width: '14px', height: '14px' }} />
                  Never Visit (Blacklist)
                </button>
              </div>

              {/* Reviews Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h4 style={{ fontFamily: 'Outfit', fontSize: '0.95rem', textTransform: 'uppercase', color: 'hsl(var(--text-muted))', letterSpacing: '0.05em', borderBottom: '1px solid hsl(var(--border-muted))', paddingBottom: '0.3rem' }}>
                  Reviews Feed
                </h4>

                {drawerLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem', alignItems: 'center' }}>
                    <Compass className="animate-spin" style={{ width: '24px', height: '24px', stroke: '#818cf8', animation: 'spin 2s linear infinite' }} />
                    <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>Retrieving reviews...</span>
                  </div>
                ) : !drawerDetails?.reviews || drawerDetails.reviews.length === 0 ? (
                  <div style={{ padding: '1rem', textAlign: 'center', color: 'hsl(var(--text-muted))', fontSize: '0.85rem', fontStyle: 'italic' }}>
                    No reviews available for this business.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {drawerDetails.reviews.map((rev, index) => (
                      <div key={index} className="glass-card" style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'hsla(var(--bg-secondary) / 0.5)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {rev.profilePhotoUrl ? (
                              <img 
                                src={rev.profilePhotoUrl} 
                                alt={rev.authorName} 
                                style={{ width: '24px', height: '24px', borderRadius: '50%' }} 
                              />
                            ) : (
                              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'hsl(var(--primary-glow))', color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                {rev.authorName.charAt(0)}
                              </div>
                            )}
                            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'hsl(var(--text-primary))' }}>
                              {rev.authorName}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>
                            {rev.relativeTime}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.1rem', color: 'hsl(var(--warning))', fontSize: '0.75rem' }}>
                          {'★'.repeat(Math.round(rev.rating)) + '☆'.repeat(5 - Math.round(rev.rating))}
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))', lineHeight: '1.4', fontStyle: 'italic' }}>
                          "{rev.text}"
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiscoverSwiper;
