const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
    fullname: {
        firstname: {
            type: String,
            required: true,
            minlength: [3, 'First name must be at least 3 characters long'],
        },
        lastname: {
            type: String,
            minlength: [3, 'Last name must be at least 3 characters long'],
        }
    },
    email: {
        type: String,
        required: true,
        unique: true,
        minlength: [5, 'Email must be at least 5 characters long'],
    },
    password: {
        type: String,
        required: true,
        select: false,
    },
    profileImage: {
        type: String,
        default: ""
    },
    phone: {
        type: String,
        default: ""
    },
    socketId: {
        type: String,
    },
    wallet: {
        balance: {
            type: Number,
            default: 0,
            min: 0
        },
        transactions: [{
            amount: {
                type: Number,
                required: true
            },
            type: {
                type: String,
                enum: ['credit', 'debit'],
                required: true
            },
            description: {
                type: String,
                required: true
            },
            paymentMethod: {
                type: String,
                enum: ['razorpay', 'phonepe', 'wallet', 'ride_payment'],
                default: 'wallet'
            },
            createdAt: {
                type: Date,
                default: Date.now
            }
        }]
    },
    totalRides: {
        type: Number,
        default: 0
    },
    totalSpent: {
        type: Number,
        default: 0
    },
    memberSince: {
        type: Date,
        default: Date.now
    }
});

userSchema.methods.generateAuthToken = function () {
    const token = jwt.sign({ _id: this._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
    return token;
};

userSchema.methods.comparePassword = async function (password) {
    return await bcrypt.compare(password, this.password);
};

userSchema.statics.hashPassword = async function (password) {
    return await bcrypt.hash(password, 10);
};

const userModel = mongoose.model('user', userSchema);

module.exports = userModel;