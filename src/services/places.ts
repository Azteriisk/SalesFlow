const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

export interface PlaceReview {
  authorName: string;
  rating: number;
  text: string;
  relativeTime: string;
  profilePhotoUrl?: string;
}

export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  latitude: number;
  longitude: number;
  rating?: number;
  userRatingsTotal?: number;
  types: string[];
  photoUrl?: string;
  reviews?: PlaceReview[];
  distanceKm?: number;
  matchScore?: number;
  matchReasons?: string[];
}

let googleMapsLoadedPromise: Promise<void> | null = null;

export function loadGoogleMapsScript(): Promise<void> {
  if (googleMapsLoadedPromise) return googleMapsLoadedPromise;

  googleMapsLoadedPromise = new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && (window as any).google && (window as any).google.maps) {
      resolve();
      return;
    }

    if (!API_KEY) {
      console.warn('Google Maps API key is missing. Geolocation queries will fail.');
      reject(new Error('Google Maps API key is missing. Please add it to your .env file.'));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      resolve();
    };
    script.onerror = (err) => {
      console.error('Failed to load Google Maps script', err);
      reject(err);
    };
    document.head.appendChild(script);
  });

  return googleMapsLoadedPromise;
}

export const INDUSTRY_CATEGORIES = [
  { id: 'auto_repair', label: 'Auto Repair', query: 'auto repair shop mechanic' },
  { id: 'warehouse', label: 'Warehouse & Logistics', query: 'warehouse logistics distribution center' },
  { id: 'restaurant', label: 'Restaurants', query: 'restaurant cafe dining' },
  { id: 'manufacturing', label: 'Manufacturing & Steel Mills', query: 'steel mill manufacturing factory industrial' },
  { id: 'waste_management', label: 'Waste Management', query: 'waste management recycling sanitation' },
  { id: 'contractor', label: 'HVAC, Plumbing & Electric', query: 'hvac contractor plumber electrician' },
  { id: 'construction', label: 'Construction & Landscaping', query: 'construction company landscaper general contractor' }
];

export async function searchNearbyPlaces(
  lat: number,
  lng: number,
  radiusKm: number,
  categoryIds: string[]
): Promise<PlaceResult[]> {
  await loadGoogleMapsScript();

  if (!(window as any).google || !(window as any).google.maps || !(window as any).google.maps.places) {
    throw new Error('Google Maps SDK not fully loaded.');
  }

  // Google PlacesService requires a map or HTML element to work. We use a dummy div.
  const dummyEl = document.createElement('div');
  const service = new (window as any).google.maps.places.PlacesService(dummyEl);

  const radiusInMeters = radiusKm * 1000;
  const location = new (window as any).google.maps.LatLng(lat, lng);

  const activeCategories = INDUSTRY_CATEGORIES.filter(c => categoryIds.includes(c.id));
  if (activeCategories.length === 0) return [];

  const allResultsMap = new Map<string, PlaceResult>();

  // Run a query for each active category keyword (parallel queries)
  const promises = activeCategories.map((category) => {
    return new Promise<void>((resolve) => {
      const request = {
        location,
        radius: radiusInMeters,
        keyword: category.query
      };

      service.nearbySearch(request, (results: any[], status: any) => {
        if (status === (window as any).google.maps.places.PlacesServiceStatus.OK && results) {
          results.forEach((place) => {
            if (!place.place_id) return;

            // Get photo URL if available
            let photoUrl = '';
            if (place.photos && place.photos.length > 0) {
              try {
                photoUrl = place.photos[0].getUrl({ maxWidth: 400, maxHeight: 300 });
              } catch (e) {
                console.warn('Could not extract photo url', e);
              }
            }

            allResultsMap.set(place.place_id, {
              id: place.place_id,
              name: place.name || 'Unknown Business',
              address: place.vicinity || place.formatted_address || '',
              latitude: place.geometry?.location?.lat() ?? lat,
              longitude: place.geometry?.location?.lng() ?? lng,
              rating: place.rating,
              userRatingsTotal: place.user_ratings_total,
              types: place.types || [],
              photoUrl
            });
          });
        }
        resolve();
      });
    });
  });

  await Promise.all(promises);
  return Array.from(allResultsMap.values());
}

// Fetch detailed information for a single place (phone number, website, etc.)
export async function getPlaceDetails(
  placeId: string,
  _placeName?: string,
  _types?: string[]
): Promise<Partial<PlaceResult>> {
  try {
    await loadGoogleMapsScript();

    if (!(window as any).google || !(window as any).google.maps || !(window as any).google.maps.places) {
      throw new Error('Google Maps SDK not fully loaded.');
    }

    const dummyEl = document.createElement('div');
    const service = new (window as any).google.maps.places.PlacesService(dummyEl);

    return new Promise((resolve) => {
      const request = {
        placeId,
        fields: ['formatted_phone_number', 'website', 'formatted_address', 'reviews', 'rating', 'user_ratings_total']
      };

      service.getDetails(request, (place: any, status: any) => {
        if (status === (window as any).google.maps.places.PlacesServiceStatus.OK && place) {
          resolve({
            phone: place.formatted_phone_number || undefined,
            website: place.website || undefined,
            address: place.formatted_address || undefined,
            reviews: place.reviews?.map((r: any) => ({
              authorName: r.author_name || 'Anonymous User',
              rating: r.rating || 5,
              text: r.text || '',
              relativeTime: r.relative_time_description || 'some time ago',
              profilePhotoUrl: r.profile_photo_url || undefined
            })) || []
          });
        } else {
          console.warn(`PlacesService failed for ${placeId}: ${status}. Returning empty details.`);
          resolve({});
        }
      });
    });
  } catch (err) {
    console.warn(`getPlaceDetails error for ${placeId}. Returning empty details.`, err);
    return {};
  }
}
