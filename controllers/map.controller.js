// maps.controller.js
const { validationResult } = require('express-validator');
const {
  getAddressCoordinate,
  getDistanceTime: getDistanceTimeService,
  getAutoCompleteSuggestions
} = require('../service/maps.service');

// -------------------- Get Coordinates --------------------
module.exports.getCoordinates = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { address } = req.query;

  try {
    const coordinates = await getAddressCoordinate(address);
    res.status(200).json(coordinates);
  } catch (error) {
    console.error('Error in getCoordinates:', error.message);
    if (error.message === 'Address is required') {
      return res.status(400).json({ message: 'Please enter a complete address.' });
    }
    if (error.message === 'No results found') {
      return res.status(404).json({ message: 'No location found for the given address.' });
    }
    if (error.message && error.message.toLowerCase().includes('rate limit')) {
      return res.status(429).json({ message: 'Rate limit exceeded. Please try again later.' });
    }
    if (error.message && error.message.toLowerCase().includes('invalid key')) {
      return res.status(401).json({ message: 'Invalid LocationIQ API key.' });
    }
    if (error.response && error.response.data) {
      return res.status(error.response.status).json({ message: error.response.data.error || error.message });
    }
    res.status(500).json({ message: error.message || 'Coordinates not found' });
  }
};

// -------------------- Get Distance & Time --------------------
module.exports.getDistanceTime = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { origin, destination } = req.query;

  try {
    const distanceTime = await getDistanceTimeService(origin, destination);
    res.status(200).json(distanceTime);
  } catch (err) {
    console.error('Error in getDistanceTime:', err.message);
    if (err.message === 'Origin and destination are required') {
      return res.status(400).json({ message: 'Please provide both origin and destination addresses.' });
    }
    if (err.message === 'No route found') {
      return res.status(404).json({ message: 'No route found between the given locations.' });
    }
    if (err.message && err.message.toLowerCase().includes('rate limit')) {
      return res.status(429).json({ message: 'Rate limit exceeded. Please try again later.' });
    }
    if (err.message && err.message.toLowerCase().includes('invalid key')) {
      return res.status(401).json({ message: 'Invalid LocationIQ API key.' });
    }
    if (err.response && err.response.data) {
      return res.status(err.response.status).json({ message: err.response.data.error || err.message });
    }
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
};

// -------------------- Autocomplete Suggestions --------------------
module.exports.getAutocompleteSuggestions = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { input } = req.query;

  try {
    const suggestions = await getAutoCompleteSuggestions(input);
    res.status(200).json(suggestions);
  } catch (err) {
    console.error('Error in getAutocompleteSuggestions:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
};
