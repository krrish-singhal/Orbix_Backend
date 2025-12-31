const rideService = require('../service/ride.service');
const { validationResult } = require('express-validator');
const mapService = require('../service/maps.service');
const { sendMessageToSocketId } = require('../socket');
const rideModel = require('../models/ride.model');
const captainModel = require('../models/captain.model');
const userModel = require('../models/user.model');



module.exports.createRide = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { pickup, destination, vehicleType, fare, distance, duration } = req.body;

    try {
        // Calculate distance and time if not provided
        let finalDistance = distance || 0;
        let finalDuration = duration || 0;
        
        if (!distance || !duration) {
            try {
                const distanceTimeData = await mapService.getDistanceTime(pickup, destination);
                finalDistance = parseFloat(distanceTimeData.distance.replace(' km', ''));
                finalDuration = parseFloat(distanceTimeData.duration.replace(' mins', ''));
            } catch (distanceError) {
                finalDistance = 5; // Default 5km
                finalDuration = 15; // Default 15 minutes
            }
        }

        // Use provided fare data instead of recalculating to avoid rate limits
        const finalFare = fare || 100; // fallback fare
        
        // Use the ride service to create ride with single OTP generation
        const ride = await rideService.createRide({
            user: req.user._id,
            pickup,
            destination,
            vehicleType
        });

        const rideWithUser = await rideModel.findById(ride._id).populate('user');
        
        res.status(201).json({
            ride: rideWithUser,
            fare: finalFare,
            distance: finalDistance,
            duration: finalDuration
        });

        // Try to get pickup coordinates, but handle rate limit gracefully
        let captainsInRadius = [];
        try {
            const pickupCoordinates = await mapService.getAddressCoordinate(pickup);
            captainsInRadius = await mapService.getCaptainsInTheRadius(
                pickupCoordinates.lat, 
                pickupCoordinates.lng, 
                2,
                vehicleType
            );
        } catch (coordError) {
            // Fallback: find all active captains with matching vehicle type, ignoring location
            const captainModel = require('../models/captain.model');
            captainsInRadius = await captainModel.find({
                status: 'active',
                'vehicle.vehicleType': vehicleType
            });
        }

        // Send ride request to available captains via socket
        const { getIO } = require('../socket');
        const io = getIO();
        // If no captains found in radius, fallback to all active captains of vehicleType (ignoring location)
        if (io && captainsInRadius.length === 0) {
            const captainModel = require('../models/captain.model');
            captainsInRadius = await captainModel.find({
                status: 'active',
                'vehicle.vehicleType': vehicleType
            });
        }
        if (io && captainsInRadius.length > 0) {
            captainsInRadius.forEach(captain => {
                if (captain.socketId) {
                    io.to(captain.socketId).emit('ride-request', {
                        rideId: ride._id,
                        otp: ride.otp, // Include OTP in ride request
                        user: {
                            name: (rideWithUser.user.fullname?.firstname + ' ' + (rideWithUser.user.fullname?.lastname || '')).trim(),
                            phone: rideWithUser.user.phone,
                            profilePic: rideWithUser.user.profilePic
                        },
                        pickup,
                        destination,
                        fare: finalFare,
                        vehicleType,
                        distance: finalDistance,
                        duration: finalDuration
                    });
                }
            });
        }

    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

module.exports.getFare = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { pickup, destination } = req.query;

    try {
        const fare = await rideService.getFare(pickup, destination);
        return res.status(200).json(fare);
    } catch (err) {
        console.error('Error in getFare controller:', err);
        return res.status(500).json({ message: err.message });
    }
}

module.exports.getRideHistory = async (req, res) => {
    try {
        const { filter, dateRange } = req.query;
        let query = { user: req.user._id };
        if (filter && filter !== 'all') {
            query.status = filter;
        }
        if (dateRange) {
            let startDate;
            const now = new Date();
            switch(dateRange) {
                case '1week':
                    startDate = new Date();
                    startDate.setDate(now.getDate() - 7);
                    break;
                case '1month':
                    startDate = new Date();
                    startDate.setMonth(now.getMonth() - 1);
                    break;
                case '3months':
                    startDate = new Date();
                    startDate.setMonth(now.getMonth() - 3);
                    break;
                case '6months':
                    startDate = new Date();
                    startDate.setMonth(now.getMonth() - 6);
                    break;
                case '1year':
                    startDate = new Date();
                    startDate.setFullYear(now.getFullYear() - 1);
                    break;
                default:
                    startDate = new Date();
                    startDate.setMonth(now.getMonth() - 6);
            }
            query.createdAt = { $gte: startDate };
        }
        const rides = await rideModel.find(query)
            .populate('captain')
            .populate('user')
            .sort({ createdAt: -1 })
            .limit(100);
        res.status(200).json({ rides });
    } catch (error) {
        console.error('Error in getRideHistory:', error);
        res.status(500).json({ message: error.message });
    }
}

module.exports.getRideById = async (req, res) => {
    try {
        const { rideId } = req.params;
        const ride = await rideModel.findById(rideId)
            .populate('user')
            .populate('captain');
        
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        // Check if user is authorized to view this ride
        if (ride.user._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized to view this ride' });
        }
        
        res.status(200).json({ ride });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports.getCurrentRides = async (req, res) => {
    try {
        const rides = await rideModel.find({ 
            user: req.user._id,
            status: { $in: ['pending', 'accepted', 'ongoing'] }
        }).populate('captain');
        
        res.status(200).json({ rides });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports.updateRideStatus = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { rideId } = req.params;
        const { status } = req.body;
        
        const ride = await rideModel.findByIdAndUpdate(
            rideId,
            { status },
            { new: true }
        ).populate('user captain');
        
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }
        
        res.status(200).json({ ride });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// Captain ride management functions
module.exports.getAvailableRides = async (req, res) => {
    try {
        const rides = await rideModel.find({ 
            status: 'pending',
            captain: null
        }).populate('user').sort({ createdAt: -1 });
        
        res.status(200).json({ rides });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports.acceptRide = async (req, res) => {
    try {
        const { rideId } = req.params;
        
        const ride = await rideModel.findOneAndUpdate(
            { _id: rideId, status: 'pending', captain: null },
            { 
                captain: req.user._id,
                status: 'accepted'
            },
            { new: true }
        ).populate('user captain').select('+otp');
        
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found or already accepted' });
        }
        
        // Emit ride-accepted event to user and captain with OTP
        const { getIO } = require('../socket');
        const io = getIO();
        if (io && ride && ride.captain && ride.user) {
            // Send to captain
            if (ride.captain.socketId) {
                io.to(ride.captain.socketId).emit('ride-accepted', {
                    ride: {
                        _id: ride._id,
                        otp: ride.otp,
                        pickup: ride.pickup,
                        destination: ride.destination,
                        fare: ride.fare,
                        vehicleType: ride.vehicleType,
                        status: ride.status
                    },
                    captain: {
                        id: ride.captain._id,
                        name: ride.captain.fullname?.firstname + ' ' + (ride.captain.fullname?.lastname || ''),
                        phone: ride.captain.phone,
                        vehicleType: ride.captain.vehicle?.vehicleType,
                        plate: ride.captain.vehicle?.plate,
                        color: ride.captain.vehicle?.color
                    },
                    otp: ride.otp
                });
            }
            // Send to user
            if (ride.user.socketId) {
                io.to(ride.user.socketId).emit('ride-accepted', {
                    ride: {
                        _id: ride._id,
                        otp: ride.otp,
                        pickup: ride.pickup,
                        destination: ride.destination,
                        fare: ride.fare,
                        vehicleType: ride.vehicleType,
                        status: ride.status
                    },
                    captain: {
                        id: ride.captain._id,
                        name: ride.captain.fullname?.firstname + ' ' + (ride.captain.fullname?.lastname || ''),
                        phone: ride.captain.phone,
                        vehicleType: ride.captain.vehicle?.vehicleType,
                        plate: ride.captain.vehicle?.plate,
                        color: ride.captain.vehicle?.color
                    },
                    otp: ride.otp
                });
            }
        }
        res.status(200).json({ ride });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports.startRide = async (req, res) => {
    try {
        const { rideId } = req.params;
        const { otp } = req.body;
        
        const ride = await rideModel.findOne({
            _id: rideId,
            captain: req.user._id,
            status: 'accepted'
        }).populate('user captain');
        
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }
        
        // In a real app, you'd verify the OTP here
        // For now, we'll accept any 4-digit OTP
        if (!otp || otp.length !== 4) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }
        
        ride.status = 'ongoing';
        await ride.save();
        
        res.status(200).json({ ride });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports.completeRide = async (req, res) => {
    try {
        const { rideId } = req.params;
        
        const ride = await rideModel.findOneAndUpdate(
            { 
                _id: rideId, 
                captain: req.user._id,
                status: 'ongoing'
            },
            { status: 'completed' },
            { new: true }
        ).populate('user captain');
        
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }
        
        res.status(200).json({ ride });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports.confirmRide = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { rideId } = req.body;

    try {
        const ride = await rideService.confirmRide({ rideId, captain: req.captain });

        sendMessageToSocketId(ride.user.socketId, {
            event: 'ride-confirmed',
            data: ride
        })

        return res.status(200).json(ride);
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
}

// Start ride with OTP verification
module.exports.startRide = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { rideId, otp } = req.body;

    try {
        const ride = await rideModel.findById(rideId).populate('user captain');
        
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        if (ride.status !== 'accepted') {
            return res.status(400).json({ message: 'Ride is not accepted yet' });
        }

        if (ride.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        ride.status = 'ongoing';
        ride.startTime = new Date();
        await ride.save();

        sendMessageToSocketId(ride.user.socketId, {
            event: 'ride-started',
            data: ride
        });

        return res.status(200).json({ 
            message: 'Ride started successfully',
            ride 
        });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
}

// Complete ride
module.exports.endRide = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { rideId, waitingCharges = 0 } = req.body;

    try {
        const ride = await rideModel.findById(rideId).populate('user captain');
        
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        if (ride.status !== 'ongoing') {
            return res.status(400).json({ message: 'Ride is not ongoing' });
        }

        // Add waiting charges to fare
        ride.waitingCharges = waitingCharges;
        ride.totalFare = ride.fare + waitingCharges;
        ride.status = 'completed';
        ride.endTime = new Date();
        
        // Calculate duration in minutes
        let duration = 0;
        if (ride.startTime) {
            duration = Math.ceil((ride.endTime - ride.startTime) / (1000 * 60));
        }
        ride.duration = duration;

        await ride.save();

        // Check if wallet was linked - if yes, auto-deduct
        if (ride.walletLinked) {
            try {
                const user = await userModel.findById(ride.user._id);
                
                if (user.wallet.balance >= ride.totalFare) {
                    // Deduct from wallet
                    user.wallet.balance -= ride.totalFare;
                    user.wallet.transactions.push({
                        amount: ride.totalFare,
                        type: 'debit',
                        description: `Ride payment from ${ride.pickup.substring(0, 30)} to ${ride.destination.substring(0, 30)}`,
                        paymentMethod: 'wallet'
                    });
                    user.totalSpent = (user.totalSpent || 0) + ride.totalFare;
                    user.totalRides = (user.totalRides || 0) + 1;
                    await user.save();

                    // Update captain earnings (80% of total fare)
                    const captainEarnings = Math.round(ride.totalFare * 0.8);
                    const captain = await captainModel.findById(ride.captain._id);
                    if (captain) {
                        captain.todayEarnings = (captain.todayEarnings || 0) + captainEarnings;
                        captain.tripsToday = (captain.tripsToday || 0) + 1;
                        captain.weeklyTrips = (captain.weeklyTrips || 0) + 1;
                        captain.weeklyEarnings = (captain.weeklyEarnings || 0) + captainEarnings;
                        captain.totalTrips = (captain.totalTrips || 0) + 1;
                        captain.onlineHours = (captain.onlineHours || 0) + Math.ceil(duration / 60);
                        captain.avgRideTime = Math.ceil(
                            ((captain.avgRideTime || 0) * (captain.totalTrips - 1) + duration) / captain.totalTrips
                        );
                        await captain.save();
                    }

                    // Mark payment as completed
                    ride.paymentStatus = 'completed';
                    ride.paymentMethod = 'wallet';
                    await ride.save();

                    // Send success notification to both
                    const { getIO } = require('../socket');
                    const io = getIO();
                    if (io) {
                        if (ride.user.socketId) {
                            io.to(ride.user.socketId).emit('payment-success', {
                                ride,
                                amount: ride.totalFare,
                                method: 'wallet',
                                balance: user.wallet.balance
                            });
                        }
                        if (ride.captain.socketId) {
                            io.to(ride.captain.socketId).emit('payment-success', {
                                ride,
                                captainEarnings: captainEarnings,
                                amount: ride.totalFare
                            });
                        }
                    }

                    return res.status(200).json({
                        ride,
                        paymentProcessed: true,
                        paymentMethod: 'wallet',
                        earnings: captainEarnings,
                        balance: user.wallet.balance
                    });
                } else {
                    // Insufficient balance - set payment status as pending
                    ride.paymentStatus = 'pending';
                    ride.walletLinked = false; // Unlink wallet
                    await ride.save();
                }
            } catch (walletError) {
                console.error('Wallet payment error:', walletError);
                ride.paymentStatus = 'pending';
                await ride.save();
            }
        }

        // If wallet not linked or failed, return ride for manual payment
        // Don't update captain earnings yet - wait for payment
        ride.paymentStatus = 'pending';
        await ride.save();

        // Update user ride count (but not totalSpent yet)
        const user = await userModel.findById(ride.user._id);
        if (user) {
            user.totalRides = (user.totalRides || 0) + 1;
            await user.save();
        }

        // Notify both that ride ended and payment is pending
        const { getIO } = require('../socket');
        const io = getIO();
        if (io) {
            if (ride.user.socketId) {
                io.to(ride.user.socketId).emit('ride-ended', {
                    ride,
                    paymentPending: true
                });
            }
            if (ride.captain.socketId) {
                io.to(ride.captain.socketId).emit('ride-ended', {
                    ride,
                    paymentPending: true
                });
            }
        }

        return res.status(200).json({ 
            message: 'Ride completed - payment pending',
            ride,
            paymentPending: true,
            totalFare: ride.totalFare
        });
    } catch (err) {
        console.error('Error in endRide:', err);
        return res.status(500).json({ message: err.message });
    }
}

// Add rating to a ride
module.exports.rateRide = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { rideId, rating, review } = req.body;

    try {
        const ride = await rideModel.findById(rideId).populate('captain');
        
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        if (ride.status !== 'completed') {
            return res.status(400).json({ message: 'Can only rate completed rides' });
        }

        // Add rating to ride
        ride.rating = rating;
        ride.review = review;
        await ride.save();

        // Update captain's average rating
        const captain = await captainModel.findById(ride.captain._id);
        if (captain) {
            const ratedRides = await rideModel.find({ 
                captain: captain._id, 
                rating: { $exists: true, $ne: null } 
            });
            
            if (ratedRides.length > 0) {
                const totalRating = ratedRides.reduce((sum, r) => sum + r.rating, 0);
                captain.rating = (totalRating / ratedRides.length).toFixed(1);
                await captain.save();
            }
        }

        return res.status(200).json({ 
            message: 'Rating submitted successfully',
            ride 
        });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
}

// Get ride history for user
module.exports.getUserRideHistory = async (req, res) => {
    try {
        const rides = await rideModel.find({ user: req.user._id })
            .populate('captain', 'fullname vehicle rating')
            .sort({ createdAt: -1 })
            .limit(50);

        return res.status(200).json({ rides });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
}

// Get ride history for captain
module.exports.getCaptainRideHistory = async (req, res) => {
    try {
        const { filter, dateRange } = req.query;
        let query = { captain: req.captain._id };
        if (filter && filter !== 'all') {
            query.status = filter;
        }
        if (dateRange) {
            let startDate;
            const now = new Date();
            switch(dateRange) {
                case '1week':
                    startDate = new Date();
                    startDate.setDate(now.getDate() - 7);
                    break;
                case '1month':
                    startDate = new Date();
                    startDate.setMonth(now.getMonth() - 1);
                    break;
                case '3months':
                    startDate = new Date();
                    startDate.setMonth(now.getMonth() - 3);
                    break;
                case '6months':
                    startDate = new Date();
                    startDate.setMonth(now.getMonth() - 6);
                    break;
                case '1year':
                    startDate = new Date();
                    startDate.setFullYear(now.getFullYear() - 1);
                    break;
                default:
                    startDate = new Date();
                    startDate.setMonth(now.getMonth() - 6);
            }
            query.createdAt = { $gte: startDate };
        }
        const rides = await rideModel.find(query)
            .populate('user', 'fullname')
            .sort({ createdAt: -1 })
            .limit(100);
        return res.status(200).json({ rides });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
}

// Captain update ride status from history
module.exports.captainUpdateRideStatus = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { rideId } = req.params;
        const { status } = req.body;
        const captainId = req.captain._id;
        
        // Find the ride and verify captain ownership
        const ride = await rideModel.findOne({ 
            _id: rideId,
            captain: captainId
        }).populate('user captain');
        
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found or unauthorized' });
        }
        
        // Update ride status
        ride.status = status;
        if (status === 'completed') {
            ride.endTime = new Date();
        }
        await ride.save();
        
        // Emit socket event to user about status change
        const io = require('../socket').getIO();
        if (io && ride.user && ride.user.socketId) {
            io.to(ride.user.socketId).emit('ride-status-updated', {
                rideId: ride._id,
                status: status,
                message: status === 'cancelled' ? 'Your ride has been cancelled by the driver' : 'Your ride has been completed'
            });
        }
        
        res.status(200).json({ 
            success: true,
            ride,
            message: `Ride status updated to ${status}`
        });
    } catch (error) {
        console.error('Error updating ride status:', error);
        res.status(500).json({ message: error.message });
    }
}

