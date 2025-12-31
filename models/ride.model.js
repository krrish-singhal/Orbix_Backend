const mongoose = require('mongoose');


const rideSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    captain: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'captain',
    },
    pickup: {
        type: String,
        required: true,
    },
    destination: {
        type: String,
        required: true,
    },
    fare: {
        type: Number,
        required: true,
    },
    waitingCharges: {
        type: Number,
        default: 0
    },
    totalFare: {
        type: Number
    },
    walletLinked: {
        type: Boolean,
        default: false
    },
    vehicleType: {
        type: String,
        enum: ['auto', 'car', 'moto'],
        required: true,
    },
    status: {
        type: String,
        enum: [ 'pending', 'accepted', "ongoing", 'completed', 'cancelled' ],
        default: 'pending',
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    duration: {
        type: Number,
    }, // in seconds
    distance: {
        type: Number,
    }, // in meters
    estimatedArrival: {
        type: Date,
    },
    actualArrival: {
        type: Date,
    },
    paymentMethod: {
        type: String,
        enum: ['wallet', 'razorpay', 'phonepe', 'cash', 'upi', 'card', 'netbanking'],
        default: 'cash'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    walletLinked: {
        type: Boolean,
        default: false
    },
    paymentID: {
        type: String,
    },
    orderId: {
        type: String,
    },
    signature: {
        type: String,
    },
    otp:{
        type: String,
        required: true,
    },
    rating: {
        type: Number,
        min: 1,
        max: 5
    },
    review: {
        type: String
    },
    startTime: {
        type: Date
    },
    endTime: {
        type: Date
    }
}, {
    timestamps: true
})

module.exports = mongoose.model('ride', rideSchema);