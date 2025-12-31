const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const captainSchema = new mongoose.Schema({
    fullname: {
        firstname: {
            type: String,
            required: true,
            minlength: [ 3, 'Firstname must be at least 3 characters long' ],
        },
        lastname: {
            type: String,
            minlength: [ 3, 'Lastname must be at least 3 characters long' ],
        }
    },
    phone: {
        type: String,
        default: null
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        match: [ /^\S+@\S+\.\S+$/, 'Please enter a valid email' ]
    },
    password: {
        type: String,
        required: true,
        select: false,
    },
    socketId: {
        type: String,
    },

    profileImage: {
        type: String,
        default: null
    },

    status: {
        type: String,
        enum: [ 'active', 'inactive' ],
        default: 'inactive',
    },

    vehicle: {
        color: {
            type: String,
            required: true,
            minlength: [ 3, 'Color must be at least 3 characters long' ],
        },
        plate: {
            type: String,
            required: true,
            minlength: [ 3, 'Plate must be at least 3 characters long' ],
        },
        capacity: {
            type: Number,
            required: true,
            min: [ 1, 'Capacity must be at least 1' ],
        },
        vehicleType: {
            type: String,
            required: true,
            enum: [ 'car', 'moto', 'auto' ],
        }
    },

    location: {
        ltd: {                      // Latitude
            type: Number,
        },
        lng: {                       // Longitude
            type: Number,
        }
    },

    // Statistics fields
    todayEarnings: {
        type: Number,
        default: 0
    },
    tripsToday: {
        type: Number,
        default: 0
    },
    weeklyTrips: {
        type: Number,
        default: 0
    },
    weeklyEarnings: {
        type: Number,
        default: 0
    },
    totalTrips: {
        type: Number,
        default: 0
    },
    rating: {
        type: Number,
        default: 4.5,
        min: 1,
        max: 5
    },
    avgRideTime: {
        type: Number,
        default: 25
    },
    onlineHours: {
        type: Number,
        default: 0
    },
    lastEarningsReset: {
        type: Date,
        default: Date.now
    },
    lastWeeklyReset: {
        type: Date,
        default: Date.now
    }
})

// Create geospatial index for location queries
captainSchema.index({ location: '2dsphere' });


captainSchema.methods.generateAuthToken = function () {
    const token = jwt.sign({ _id: this._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
    return token;
}


captainSchema.methods.comparePassword = async function (password) {
    return await bcrypt.compare(password, this.password);
}


captainSchema.statics.hashPassword = async function (password) {
    return await bcrypt.hash(password, 10);
}

const captainModel = mongoose.model('captain', captainSchema)


module.exports = captainModel;