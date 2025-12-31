
const axios = require('axios');
const captainModel = require('../models/captain.model');

const apiKey = process.env.LOCATIONIQ_API_KEY;
// Cache for geocoding and routing
const geoCache = new Map();
const routeCache = new Map();
const GEO_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const ROUTE_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
let lastGeoRequestTime = 0;
let lastRouteRequestTime = 0;
const MIN_GEO_REQUEST_INTERVAL = 1000; // 1 second
const MIN_ROUTE_REQUEST_INTERVAL = 1000; // 1 second

// Cache for storing recent suggestions
const suggestionCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second between requests

// Get Coordinates from LocationIQ
const getAddressCoordinate = async (address) => {
  if (!address || address.trim().length === 0) {
    throw new Error('Address is required');
  }
  const cacheKey = address.toLowerCase().trim();
  const cached = geoCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < GEO_CACHE_DURATION) {
    return cached.data;
  }
  // Throttle requests
  const now = Date.now();
  if (now - lastGeoRequestTime < MIN_GEO_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_GEO_REQUEST_INTERVAL - (now - lastGeoRequestTime)));
  }
  lastGeoRequestTime = Date.now();
  const url = `https://us1.locationiq.com/v1/search.php?key=${apiKey}&q=${encodeURIComponent(address)}&format=json`;
  try {
    const response = await axios.get(url);
    if (response.data && response.data.length > 0) {
      const location = response.data[0];
      const result = {
        lat: parseFloat(location.lat),
        lng: parseFloat(location.lon),
      };
      geoCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } else {
      throw new Error('No results found');
    }
  } catch (error) {
    if (error.response && error.response.data) {
      console.error('LocationIQ error:', error.response.data.error || error.message);
      throw new Error(error.response.data.error || error.message);
    }
    console.error('Error fetching coordinates from LocationIQ:', error.message);
    throw error;
  }
};

// Get Distance and Time between two places using coordinates
const getDistanceTime = async (originAddress, destinationAddress) => {
  if (!originAddress || !destinationAddress) {
    throw new Error('Origin and destination are required');
  }
  // Cache key based on origin and destination
  const cacheKey = `${originAddress.toLowerCase().trim()}|${destinationAddress.toLowerCase().trim()}`;
  const cached = routeCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < ROUTE_CACHE_DURATION) {
    return cached.data;
  }
  // Throttle requests
  const now = Date.now();
  if (now - lastRouteRequestTime < MIN_ROUTE_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_ROUTE_REQUEST_INTERVAL - (now - lastRouteRequestTime)));
  }
  lastRouteRequestTime = Date.now();
  try {
    const origin = await getAddressCoordinate(originAddress);
    const destination = await getAddressCoordinate(destinationAddress);
    const url = `https://us1.locationiq.com/v1/directions/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?key=${apiKey}&overview=false`;
    const response = await axios.get(url);
    if (!response.data || !response.data.routes || response.data.routes.length === 0) {
      throw new Error('No route found');
    }
    const route = response.data.routes[0];
    const distanceInKm = route.distance / 1000;
    const durationInMin = route.duration / 60;
    const result = {
      distance: `${distanceInKm.toFixed(2)} km`,
      duration: `${durationInMin.toFixed(1)} mins`,
    };
    routeCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (error) {
    console.error('Error in getDistanceTime:', error.message);
    throw error;
  }
};

// Autocomplete Location Suggestions with rate limiting and caching
const getAutoCompleteSuggestions = async (input) => {
  if (!input || input.trim().length < 2) {
    return [];
  }

  // Check cache first
  const cacheKey = input.toLowerCase().trim();
  const cached = suggestionCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.data;
  }

  // Rate limiting - wait if too soon
  const now = Date.now();
  if (now - lastRequestTime < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - (now - lastRequestTime)));
  }

  try {
    lastRequestTime = Date.now();
    const url = `https://us1.locationiq.com/v1/autocomplete.php?key=${apiKey}&q=${encodeURIComponent(input)}&limit=5&format=json&countrycodes=in`;

    const response = await axios.get(url, {
      timeout: 5000 // 5 second timeout
    });
    
    let suggestions = [];
    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      suggestions = response.data.map(place => place.display_name).filter(Boolean);
    }

    // Cache the result
    if (suggestions.length > 0) {
      suggestionCache.set(cacheKey, {
        data: suggestions,
        timestamp: Date.now()
      });
    }

    return suggestions;
  } catch (error) {
    console.error('Error fetching autocomplete suggestions:', error.message);
    
    // If rate limited, return empty array instead of fallback
    if (error.response && error.response.status === 429) {
      console.log('Rate limited by LocationIQ API');
    }
    
    return [];
  }
};

const getCaptainsInTheRadius = async (lat, lng, radius, vehicleType) => {
  // radius in km
  // MongoDB expects [lng, lat] order
  // Increase radius to 5km for better matching
  const effectiveRadius = radius && radius > 0 ? radius : 5;
  const query = {
    location: {
      $geoWithin: {
        $centerSphere: [ [ lng, lat ], effectiveRadius / 6371 ]
      }
    },
    status: 'active'
  };
  if (vehicleType) {
    query['vehicle.vehicleType'] = vehicleType;
  }
  const captains = await captainModel.find(query);
  return captains;
}

module.exports = {
  getAddressCoordinate,
  getDistanceTime,
  getAutoCompleteSuggestions,
  getCaptainsInTheRadius
};
