const userModel = require('../models/user.model');
const crypto = require('crypto');

// Add money to wallet
const addMoneyToWallet = async (userId, amount, paymentMethod, transactionId) => {
    try {
        const user = await userModel.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Add to wallet balance
        user.wallet.balance += amount;
        
        // Add transaction record
        user.wallet.transactions.push({
            amount: amount,
            type: 'credit',
            description: `Money added via ${paymentMethod}`,
            paymentMethod: paymentMethod,
            transactionId: transactionId
        });

        await user.save();
        return user.wallet;
    } catch (error) {
        throw error;
    }
};

// Deduct money from wallet
const deductMoneyFromWallet = async (userId, amount, description = 'Ride payment') => {
    try {
        const user = await userModel.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        if (user.wallet.balance < amount) {
            throw new Error('Insufficient wallet balance');
        }

        // Deduct from wallet balance
        user.wallet.balance -= amount;
        
        // Add transaction record
        user.wallet.transactions.push({
            amount: amount,
            type: 'debit',
            description: description,
            paymentMethod: 'wallet'
        });

        await user.save();
        return user.wallet;
    } catch (error) {
        throw error;
    }
};

// Get wallet balance and transactions
const getWalletDetails = async (userId) => {
    try {
        const user = await userModel.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        return {
            balance: user.wallet.balance,
            transactions: user.wallet.transactions.slice(-20) // Return last 20 transactions
        };
    } catch (error) {
        throw error;
    }
};

// Calculate wallet discount (5% discount for wallet payments)
const calculateWalletDiscount = (fare) => {
    const discountPercentage = 0.05; // 5% discount
    const discount = Math.round(fare * discountPercentage);
    const finalAmount = fare - discount;
    
    return {
        originalFare: fare,
        discount: discount,
        finalAmount: finalAmount,
        discountPercentage: discountPercentage * 100
    };
};

// Simulate Razorpay payment
const processRazorpayPayment = async (amount, paymentDetails) => {
    // In real implementation, you would integrate with Razorpay API
    // For now, we'll simulate a successful payment
    return {
        success: true,
        transactionId: `rzp_${crypto.randomBytes(16).toString('hex')}`,
        amount: amount,
        method: 'razorpay'
    };
};

// Simulate PhonePe payment
const processPhonePePayment = async (amount, paymentDetails) => {
    // In real implementation, you would integrate with PhonePe API
    // For now, we'll simulate a successful payment
    return {
        success: true,
        transactionId: `phonepe_${crypto.randomBytes(16).toString('hex')}`,
        amount: amount,
        method: 'phonepe'
    };
};

module.exports = {
    addMoneyToWallet,
    deductMoneyFromWallet,
    getWalletDetails,
    calculateWalletDiscount,
    processRazorpayPayment,
    processPhonePePayment
};
