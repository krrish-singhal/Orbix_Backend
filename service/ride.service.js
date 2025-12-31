const rideModel = require('../models/ride.model');
const mapService = require('./maps.service');
const crypto = require('crypto');

async function getFare(pickup, destination) {
    try {
        if (!pickup || !destination) {
            throw new Error('Pickup and destination are required');
        }

        const distanceTime = await mapService.getDistanceTime(pickup, destination);

        // Parse distance and duration from strings like "1532.06 km" and "1175.0 mins"
        const distanceInKm = parseFloat(distanceTime.distance.replace(' km', ''));
        const durationInMin = parseFloat(distanceTime.duration.replace(' mins', ''));

        if (isNaN(distanceInKm) || isNaN(durationInMin)) {
            throw new Error('Invalid distance or duration data from map service');
        }

        const distanceInMeters = distanceInKm * 1000;
        const durationInSeconds = durationInMin * 60;

        const baseFare = {
            auto: 30,
            car: 50,
            moto: 20
        };

        const perKmRate = {
            auto: 10,
            car: 15,
            moto: 8
        };

        const perMinuteRate = {
            auto: 2,
            car: 3,
            moto: 1.5
        };

        const fare = {
            auto: Math.round(baseFare.auto + ((distanceInMeters / 1000) * perKmRate.auto) + ((durationInSeconds / 60) * perMinuteRate.auto)),
            car: Math.round(baseFare.car + ((distanceInMeters / 1000) * perKmRate.car) + ((durationInSeconds / 60) * perMinuteRate.car)),
            moto: Math.round(baseFare.moto + ((distanceInMeters / 1000) * perKmRate.moto) + ((durationInSeconds / 60) * perMinuteRate.moto))
        };

        return { fare, distance: distanceInKm, duration: durationInMin };
    } catch (error) {
        console.error('Error in getFare:', error);
        throw error;
    }
}

function getOtp(num) {
    return crypto.randomInt(100000, 999999).toString();
}

async function createRide({ user, pickup, destination, vehicleType }) {
    try {
        if (!user || !pickup || !destination || !vehicleType) {
            throw new Error('All fields are required');
        }

        const fareData = await getFare(pickup, destination);
        const finalFare = fareData.fare[vehicleType];

        if (typeof finalFare !== 'number' || isNaN(finalFare)) {
            throw new Error(`Invalid fare calculated for vehicle type "${vehicleType}"`);
        }

        const generatedOtp = getOtp(6);
        console.log('=== RIDE CREATION DEBUG ===');
        console.log('Generated OTP:', generatedOtp);
        console.log('OTP type:', typeof generatedOtp);
        console.log('OTP length:', generatedOtp.length);
        
        const ride = await rideModel.create({
            user,
            pickup,
            destination,
            fare: finalFare,
            otp: generatedOtp,
            vehicleType,
        });

        console.log('Saved ride OTP:', ride.otp);
        console.log('Saved ride OTP type:', typeof ride.otp);
        console.log('=== END RIDE CREATION DEBUG ===');
        
        return ride;
    } catch (error) {
        console.error('Error in createRide:', error);
        throw error;
    }
}

module.exports = {
    getFare,
    createRide,
    getOtp
};
