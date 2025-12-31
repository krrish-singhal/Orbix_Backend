const express = require('express');
const router = express.Router();
const mapsService = require('../service/maps.service');

// GET: Coordinates from address
router.get('/get-coordinates', async (req, res) => {
  try {
    const { address } = req.query;

    if (!address || address.trim() === '') {
      return res.status(400).json({ error: 'Address is required' });
    }

    const coordinates = await mapsService.getAddressCoordinate(address);
    res.json(coordinates);
  } catch (err) {
    console.error('Error in /get-coordinates:', err.message);
    res.status(500).json({ error: 'Unable to fetch coordinates' });
  }
});

// GET: Distance & Time
router.get('/get-distance-time', async (req, res) => {
  const { origin, destination } = req.query;
  try {
    const result = await mapsService.getDistanceTime(origin, destination);
    res.json(result);
  } catch (error) {
    console.error('Error in /get-distance-time:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET: Autocomplete Suggestions
router.get('/get-suggestions', async (req, res) => {
  try {
    const { input } = req.query;

    if (!input || input.trim() === '') {
      return res.status(400).json({ error: 'Input query is required' });
    }

    const suggestions = await mapsService.getAutoCompleteSuggestions(input);
    res.json(suggestions);
  } catch (err) {
    console.error('Error in /get-suggestions:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

