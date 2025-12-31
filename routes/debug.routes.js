const express = require('express');
const router = express.Router();
const captainModel = require('../models/captain.model');

// List all captains with vehicleType, status, location, and socketId
router.get('/all-captains', async (req, res) => {
  const captains = await captainModel.find({});
  res.json(captains.map(c => ({
    id: c._id,
    type: c.vehicle?.vehicleType,
    status: c.status,
    location: c.location,
    socketId: c.socketId,
    email: c.email,
    name: c.fullname?.firstname + ' ' + (c.fullname?.lastname || '')
  })));
});

// Activate all captains and optionally update their location
router.post('/activate-captains', async (req, res) => {
  const location = req.body.location;
  let update = { status: 'active' };
  if (location && location.ltd && location.lng) {
    update.location = location;
  }
  await captainModel.updateMany({}, { $set: update });
  const captains = await captainModel.find({});
  res.json({ updated: captains.length, captains });
});

// Update a specific captain's location and status
router.patch('/update-captain/:id', async (req, res) => {
  const { id } = req.params;
  const { location, status } = req.body;
  const update = {};
  if (location && location.ltd && location.lng) update.location = location;
  if (status) update.status = status;
  const captain = await captainModel.findByIdAndUpdate(id, { $set: update }, { new: true });
  res.json({ captain });
});

module.exports = router;
