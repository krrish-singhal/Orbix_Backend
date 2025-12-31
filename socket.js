const socketIo = require('socket.io');
const userModel = require('./models/user.model');
const captainModel = require('./models/captain.model');

let io;

function initializeSocket(server) {
    io = socketIo(server, {
        cors: {
            origin: '*',
            methods: [ 'GET', 'POST' ]
        }
    });

    io.on('connection', (socket) => {

        socket.on('join', async (data) => {
            const { userId, userType } = data;

            if (userType === 'user') {
                await userModel.findByIdAndUpdate(userId, { socketId: socket.id });
            } else if (userType === 'captain') {
                await captainModel.findByIdAndUpdate(userId, { socketId: socket.id });
            }
        });


        socket.on('update-location-captain', async (data) => {
            const { userId, location } = data;

            if (!location || !location.ltd || !location.lng) {
                return socket.emit('error', { message: 'Invalid location data' });
            }

            await captainModel.findByIdAndUpdate(userId, {
                location: {
                    ltd: location.ltd,
                    lng: location.lng
                }
            });
        });

        socket.on('new-ride-request', async (data) => {
            const { rideId, pickupLocation, destinationLocation, fare, vehicleType, user } = data;
            
            // Find available captains based on vehicle type
            const availableCaptains = await captainModel.find({
                status: 'active',
                'vehicle.vehicleType': vehicleType
            });

            if (availableCaptains.length === 0) {
                return socket.emit('no-captains-available');
            }

            // Send ride request to all available captains
            availableCaptains.forEach(captain => {
                if (captain.socketId) {
                    io.to(captain.socketId).emit('ride-request', {
                        rideId,
                        user: {
                            name: user.fullname,
                            phone: user.phone,
                            profilePic: user.profilePic
                        },
                        pickup: pickupLocation,
                        destination: destinationLocation,
                        fare,
                        vehicleType,
                        distance: data.distance,
                        duration: data.duration
                    });
                }
            });
        });

        socket.on('accept-ride', async (data) => {
            const { rideId, captainId } = data;
            
            try {
                const captain = await captainModel.findById(captainId);
                const rideModel = require('./models/ride.model');
                const ride = await rideModel.findByIdAndUpdate(rideId, {
                    captain: captainId,
                    status: 'accepted'
                }, { new: true }).populate('user captain');

                if (ride && ride.user && ride.user.socketId) {
                    // Notify user that ride was accepted
                    io.to(ride.user.socketId).emit('ride-accepted', {
                        captain: {
                            _id: captain._id,
                            fullname: captain.fullname,
                            phone: captain.phone,
                            vehicle: captain.vehicle,
                            location: captain.location
                        },
                        otp: ride.otp
                    });
                }

                // Notify other captains that ride was taken
                const otherCaptains = await captainModel.find({
                    _id: { $ne: captainId },
                    status: 'active',
                    'vehicle.vehicleType': ride.vehicleType
                });

                otherCaptains.forEach(captain => {
                    if (captain.socketId) {
                        io.to(captain.socketId).emit('ride-taken', { rideId });
                    }
                });

            } catch (error) {
                console.error('Error accepting ride:', error);
                socket.emit('error', { message: 'Error accepting ride' });
            }
        });

        socket.on('decline-ride', async (data) => {
            const { rideId, captainId } = data;
            // You can implement logic here to track which captains declined
        });

        socket.on('start-ride', async (data) => {
            console.log('\n🚨 START-RIDE EVENT TRIGGERED 🚨');
            console.log('Raw data received:', JSON.stringify(data, null, 2));
            
            const { rideId, otp } = data;
            
            try {
                const rideModel = require('./models/ride.model');
                const ride = await rideModel.findById(rideId).populate('user captain');
                
                console.log('\n=== COMPREHENSIVE OTP VALIDATION DEBUG ===');
                console.log('🔍 Ride ID:', rideId);
                console.log('🔍 Ride found:', !!ride);
                console.log('🔍 Ride object:', ride ? {
                    _id: ride._id,
                    otp: ride.otp,
                    status: ride.status,
                    user: ride.user ? ride.user._id : 'No user',
                    captain: ride.captain ? ride.captain._id : 'No captain'
                } : 'RIDE NOT FOUND');
                
                console.log('🔍 Provided OTP from frontend:', otp);
                console.log('🔍 Database OTP:', ride?.otp);
                console.log('🔍 Provided OTP type:', typeof otp);
                console.log('🔍 Database OTP type:', typeof ride?.otp);
                console.log('🔍 Provided OTP length:', String(otp).length);
                console.log('🔍 Database OTP length:', String(ride?.otp).length);
                
                if (!ride) {
                    console.log('❌ ERROR: Ride not found in database');
                    socket.emit('invalid-otp', {
                        message: 'Ride not found'
                    });
                    return;
                }
                
                // Ensure both OTPs are strings and trim whitespace for comparison
                const rideOtpString = String(ride.otp).trim();
                const providedOtpString = String(otp).trim();
                
                console.log('🔄 Cleaned OTPs:');
                console.log('  Database OTP (cleaned):', rideOtpString);
                console.log('  Provided OTP (cleaned):', providedOtpString);
                console.log('🔄 Character-by-character comparison:');
                for (let i = 0; i < Math.max(rideOtpString.length, providedOtpString.length); i++) {
                    console.log(`  Position ${i}: DB="${rideOtpString[i] || 'undefined'}" vs Provided="${providedOtpString[i] || 'undefined'}"`);
                }
                console.log('🔄 Exact match test:', rideOtpString === providedOtpString);
                console.log('🔄 Loose comparison test:', rideOtpString == providedOtpString);
                
                // Additional validation - ensure both are 6-digit numbers
                const isValidOtp = (otpStr) => /^\d{6}$/.test(otpStr);
                
                console.log('🔄 OTP format validation:');
                console.log('  Database OTP valid format:', isValidOtp(rideOtpString));
                console.log('  Provided OTP valid format:', isValidOtp(providedOtpString));
                
                if (!isValidOtp(rideOtpString)) {
                    console.log('❌ ERROR: Invalid OTP format in database - OTP:', rideOtpString);
                    socket.emit('invalid-otp', {
                        message: 'Invalid OTP format in system'
                    });
                    return;
                }
                
                if (!isValidOtp(providedOtpString)) {
                    console.log('❌ ERROR: Invalid OTP format provided - OTP:', providedOtpString);
                    socket.emit('invalid-otp', {
                        message: 'Invalid OTP format. Please enter 6 digits.'
                    });
                    return;
                }
                
                console.log('🎯 FINAL VALIDATION DECISION:');
                if (rideOtpString === providedOtpString) {
                    console.log('✅ SUCCESS: OTP validation passed! Starting ride...');
                    await rideModel.findByIdAndUpdate(rideId, {
                        status: 'ongoing'
                    });

                    if (ride.user && ride.user.socketId) {
                        console.log('📤 Emitting ride-started to user:', ride.user.socketId);
                        io.to(ride.user.socketId).emit('ride-started', {
                            ride: ride,
                            captain: ride.captain,
                            message: 'Your ride has started!'
                        });
                    } else {
                        console.log('⚠️ Warning: No user socketId to notify');
                    }

                    console.log('📤 Emitting ride-start-success to captain');
                    socket.emit('ride-start-success', {
                        message: 'Ride started successfully!',
                        ride: ride
                    });
                } else {
                    console.log('❌ ERROR: OTP mismatch!');
                    console.log('  Expected:', rideOtpString);
                    console.log('  Received:', providedOtpString);
                    console.log('  Sending invalid-otp event...');
                    socket.emit('invalid-otp', {
                        message: 'Invalid OTP'
                    });
                }
                console.log('=== END OTP DEBUG ===');
            } catch (error) {
                console.error('Error starting ride:', error);
                socket.emit('error', { message: 'Error starting ride' });
            }
        });

        socket.on('ride-ended', async (data) => {
            const { rideId, status } = data;
            
            try {
                const rideModel = require('./models/ride.model');
                const ride = await rideModel.findById(rideId).populate('user captain');
                
                if (!ride) {
                    return socket.emit('error', { message: 'Ride not found' });
                }
                
                // Update ride status
                await rideModel.findByIdAndUpdate(rideId, {
                    status: status || 'completed',
                    endTime: new Date()
                });
                
                // Calculate captain earnings (80% of fare)
                const captainEarnings = Math.round(ride.fare * 0.8);
                
                // Notify both user and captain
                if (ride.user && ride.user.socketId) {
                    io.to(ride.user.socketId).emit('ride-ended', {
                        message: 'Ride completed successfully!',
                        ride: ride
                    });
                }
                
                if (ride.captain && ride.captain.socketId) {
                    io.to(ride.captain.socketId).emit('ride-completed', {
                        message: 'Ride completed successfully!',
                        earnings: captainEarnings,
                        ride: ride
                    });
                }
                
                console.log(`✅ Ride ${rideId} ended. Captain earnings: ₹${captainEarnings}`);
            } catch (error) {
                console.error('Error ending ride:', error);
                socket.emit('error', { message: 'Error ending ride' });
            }
        });

        socket.on('disconnect', () => {
        });
    });
}

const sendMessageToSocketId = (socketId, messageObject) => {
    if (io) {
        io.to(socketId).emit(messageObject.event, messageObject.data);
    }
}

module.exports = { initializeSocket, sendMessageToSocketId, getIO: () => io, io: () => io };