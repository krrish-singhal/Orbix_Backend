const captainModel = require("../models/captain.model");
const { validationResult } = require('express-validator');
const captainService = require('../service/captain.service');
const blacklistTokenModel = require('../models/blacklist.model');

const createCaptain = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { fullname, email, password, vehicle } = req.body;

    const isCaptainExists = await captainModel.findOne({ email });
    if (isCaptainExists) {
        return res.status(400).json({ message: 'Captain already exists' });
    }

    const hashedPassword = await captainModel.hashPassword(password);

    const captain = await captainService.createCaptain({
        firstname: fullname.firstname,
        lastname: fullname.lastname,
        email,
        password: hashedPassword,
        color: vehicle.color,
        plate: vehicle.plate,
        capacity: vehicle.capacity,
        vehicleType: vehicle.vehicleType
    });

    const token = captain.generateAuthToken();
    res.status(201).json({ token, captain });
}

const loginCaptain = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const captain = await captainModel.findOne({ email }).select('+password');

    if (!captain) {
        return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await captain.comparePassword(password);

    if (!isMatch) {
        return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = captain.generateAuthToken();

    res.status(200).json({ token, captain });
};

const getCaptainProfile = async (req, res, next) => {
    res.status(200).json({ captain: req.captain });
}

const logoutCaptain = async (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    await blacklistTokenModel.create({ token });
    res.clearCookie('token');
    if (token) {
        res.status(200).json({ message: 'Logged out successfully' });
    } else {
        res.status(400).json({ message: 'No active session found' });
    }
};

const updateCaptainStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        
        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status. Must be active or inactive' });
        }

        const captain = await captainModel.findByIdAndUpdate(
            req.captain._id,
            { status },
            { new: true }
        );

        res.status(200).json({ captain, message: `Status updated to ${status}` });
    } catch (error) {
        console.error('Error updating captain status:', error);
        res.status(500).json({ message: 'Failed to update status' });
    }
};

const getCaptainStats = async (req, res, next) => {
    try {
        const captainId = req.captain._id;
        
        // Fetch fresh captain data from database
        const captain = await captainModel.findById(captainId);
        
        if (!captain) {
            return res.status(404).json({ message: 'Captain not found' });
        }
        
        const now = new Date();
        const lastDailyReset = new Date(captain.lastEarningsReset);
        const lastWeeklyReset = new Date(captain.lastWeeklyReset);
        
        // Check if it's a new day and reset if needed
        const isNewDay = now.toDateString() !== lastDailyReset.toDateString();
        
        // Check if it's a new week (7 days)
        const daysSinceWeeklyReset = Math.floor((now - lastWeeklyReset) / (1000 * 60 * 60 * 24));
        const isNewWeek = daysSinceWeeklyReset >= 7;
        
        let needsSave = false;
        
        if (isNewDay) {
            captain.todayEarnings = 0;
            captain.tripsToday = 0;
            captain.lastEarningsReset = now;
            needsSave = true;
        }
        
        if (isNewWeek) {
            captain.weeklyEarnings = 0;
            captain.weeklyTrips = 0;
            captain.lastWeeklyReset = now;
            needsSave = true;
        }
        
        if (needsSave) {
            await captain.save();
        }
        
        // Get actual stats from captain model
        const stats = {
            todayEarnings: captain.todayEarnings || 0,
            tripsToday: captain.tripsToday || 0,
            weeklyTrips: captain.weeklyTrips || 0,
            weeklyEarnings: captain.weeklyEarnings || 0,
            rating: captain.rating || 4.5,
            totalTrips: captain.totalTrips || 0,
            avgRideTime: captain.avgRideTime || 25,
            onlineHours: captain.onlineHours || 0
        };
        
        res.status(200).json({ stats });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch statistics' });
    }
};

const updateVehicle = async (req, res, next) => {
    try {
        const { vehicle } = req.body;
        
        const captain = await captainModel.findByIdAndUpdate(
            req.captain._id,
            { vehicle },
            { new: true }
        );

        if (!captain) {
            return res.status(404).json({ message: 'Captain not found' });
        }

        res.status(200).json({ captain, message: 'Vehicle updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update vehicle' });
    }
};

const updateCaptainStats = async (req, res, next) => {
    try {
        const { earnings, rideTime } = req.body;
        const captainId = req.captain._id;
        
        // Update captain statistics
        const updateData = {
            $inc: {
                todayEarnings: earnings || 0,
                tripsToday: 1,
                weeklyTrips: 1,
                weeklyEarnings: earnings || 0,
                totalTrips: 1,
                onlineHours: rideTime ? Math.ceil(rideTime / 60) : 0
            }
        };

        const captain = await captainModel.findByIdAndUpdate(
            captainId,
            updateData,
            { new: true }
        );

        if (!captain) {
            return res.status(404).json({ message: 'Captain not found' });
        }

        res.status(200).json({ captain, message: 'Stats updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update stats' });
    }
};

const resetDailyEarnings = async (req, res, next) => {
    try {
        const captain = await captainModel.findByIdAndUpdate(
            req.captain._id,
            { 
                todayEarnings: 0, 
                tripsToday: 0,
                weeklyEarnings: 0,
                weeklyTrips: 0,
                lastEarningsReset: new Date(),
                lastWeeklyReset: new Date()
            },
            { new: true }
        );

        if (!captain) {
            return res.status(404).json({ message: 'Captain not found' });
        }

        res.status(200).json({ 
            message: 'Daily and weekly earnings reset successfully',
            captain 
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to reset earnings' });
    }
};

const uploadProfileImage = async (req, res) => {
    try {
        if (!req.files || !req.files.profileImage) {
            return res.status(400).json({ message: 'No image file provided' });
        }

        const file = req.files.profileImage;
        
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        if (!allowedTypes.includes(file.mimetype)) {
            return res.status(400).json({ message: 'Invalid file type. Only JPEG, PNG and GIF are allowed' });
        }

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            return res.status(400).json({ message: 'File size too large. Maximum 5MB allowed' });
        }

        // Convert to base64
        const base64Image = `data:${file.mimetype};base64,${file.data.toString('base64')}`;

        // Update captain profile
        const captain = await captainModel.findByIdAndUpdate(
            req.captain._id,
            { profileImage: base64Image },
            { new: true }
        );

        res.status(200).json({
            message: 'Profile image uploaded successfully',
            profileImage: captain.profileImage
        });
    } catch (error) {
        console.error('Error uploading profile image:', error);
        res.status(500).json({ message: 'Failed to upload profile image' });
    }
};

const updateCaptainProfile = async (req, res) => {
    try {
        const { firstname, lastname, phone } = req.body;

        const updateData = {};
        if (firstname) updateData['fullname.firstname'] = firstname;
        if (lastname) updateData['fullname.lastname'] = lastname;
        if (phone) updateData['phone'] = phone;

        const captain = await captainModel.findByIdAndUpdate(
            req.captain._id,
            updateData,
            { new: true, runValidators: true }
        );

        res.status(200).json({
            message: 'Profile updated successfully',
            captain
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ message: 'Failed to update profile' });
    }
};

module.exports = {
    createCaptain,
    loginCaptain,
    getCaptainProfile,
    logoutCaptain,
    updateCaptainStatus,
    getCaptainStats,
    updateVehicle,
    updateCaptainStats,
    resetDailyEarnings,
    uploadProfileImage,
    updateCaptainProfile
}