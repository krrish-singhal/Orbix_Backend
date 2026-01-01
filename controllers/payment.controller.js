const paymentService = require('../service/payment.service');
const { validationResult } = require('express-validator');
const captainModel = require('../models/captain.model');
const rideModel = require('../models/ride.model');
const userModel = require('../models/user.model');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');

// Initialize Stripe with your secret key (will be set via env variable)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');

// Get wallet details
module.exports.getWallet = async (req, res) => {
    try {
        const walletDetails = await paymentService.getWalletDetails(req.user._id);
        res.status(200).json(walletDetails);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Add money to wallet via Razorpay
module.exports.addMoneyViaRazorpay = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { amount, paymentDetails } = req.body;

    try {
        // Process Razorpay payment
        const paymentResult = await paymentService.processRazorpayPayment(amount, paymentDetails);
        
        if (paymentResult.success) {
            // Add money to wallet
            const wallet = await paymentService.addMoneyToWallet(
                req.user._id,
                amount,
                'razorpay',
                paymentResult.transactionId
            );
            
            res.status(200).json({
                success: true,
                message: 'Money added successfully',
                wallet: wallet,
                transaction: paymentResult
            });
        } else {
            res.status(400).json({ message: 'Payment failed' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Add money to wallet via PhonePe
module.exports.addMoneyViaPhonePe = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { amount, paymentDetails } = req.body;

    try {
        // Process PhonePe payment
        const paymentResult = await paymentService.processPhonePePayment(amount, paymentDetails);
        
        if (paymentResult.success) {
            // Add money to wallet
            const wallet = await paymentService.addMoneyToWallet(
                req.user._id,
                amount,
                'phonepe',
                paymentResult.transactionId
            );
            
            res.status(200).json({
                success: true,
                message: 'Money added successfully',
                wallet: wallet,
                transaction: paymentResult
            });
        } else {
            res.status(400).json({ message: 'Payment failed' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Process ride payment
module.exports.processRidePayment = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { rideId, amount, paymentMethod } = req.body;

    try {
        let paymentResult = { success: false };

        if (paymentMethod === 'wallet') {
            // Calculate discount for wallet payment
            const discountInfo = paymentService.calculateWalletDiscount(amount);
            
            // Deduct from wallet
            const wallet = await paymentService.deductMoneyFromWallet(
                req.user._id,
                discountInfo.finalAmount,
                `Ride payment for ${rideId} (${discountInfo.discountPercentage}% discount applied)`
            );
            
            paymentResult = {
                success: true,
                paymentMethod: 'wallet',
                originalAmount: amount,
                discountApplied: discountInfo.discount,
                finalAmount: discountInfo.finalAmount,
                walletBalance: wallet.balance
            };
        } else if (paymentMethod === 'razorpay') {
            paymentResult = await paymentService.processRazorpayPayment(amount, req.body.paymentDetails);
        } else if (paymentMethod === 'phonepe') {
            paymentResult = await paymentService.processPhonePePayment(amount, req.body.paymentDetails);
        }

        if (paymentResult.success) {
            res.status(200).json({
                success: true,
                message: 'Payment processed successfully',
                paymentResult: paymentResult
            });
        } else {
            res.status(400).json({ message: 'Payment failed' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get wallet discount calculation
module.exports.getWalletDiscount = async (req, res) => {
    const { amount } = req.query;
    
    if (!amount || isNaN(amount)) {
        return res.status(400).json({ message: 'Valid amount is required' });
    }

    try {
        const discountInfo = paymentService.calculateWalletDiscount(parseFloat(amount));
        res.status(200).json(discountInfo);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Process ride payment via QR scanner (Captain)
module.exports.processRidePayment = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { amount, rideId, description, paymentMethod } = req.body;
    const captainId = req.captain._id;

    try {
        // Generate transaction ID
        const transactionId = 'TXN' + Date.now() + Math.random().toString(36).substr(2, 9);

        // Update captain's earnings
        const captain = await captainModel.findById(captainId);
        if (!captain) {
            return res.status(404).json({ message: 'Captain not found' });
        }

        captain.todayEarnings = (captain.todayEarnings || 0) + amount;
        captain.weeklyEarnings = (captain.weeklyEarnings || 0) + amount;
        
        // If rideId provided, update the ride as well
        if (rideId) {
            const ride = await rideModel.findById(rideId);
            if (ride) {
                ride.status = 'completed';
                ride.paymentMethod = paymentMethod || 'wallet';
                ride.paymentID = transactionId;
                await ride.save();
                
                // Update trip counts
                captain.tripsToday = (captain.tripsToday || 0) + 1;
                captain.weeklyTrips = (captain.weeklyTrips || 0) + 1;
                captain.totalTrips = (captain.totalTrips || 0) + 1;
            }
        }

        await captain.save();

        return res.status(200).json({
            success: true,
            message: 'Payment processed successfully',
            transactionId,
            amount,
            newEarnings: captain.todayEarnings
        });
    } catch (error) {
        return res.status(500).json({ 
            success: false,
            message: 'Payment processing failed',
            error: error.message 
        });
    }
};

// Get captain wallet data
module.exports.getCaptainWallet = async (req, res) => {
    try {
        const captain = await captainModel.findById(req.captain._id);
        if (!captain) {
            return res.status(404).json({ message: 'Captain not found' });
        }

        // Get ride transactions
        const rides = await rideModel.find({ 
            captain: captain._id,
            status: 'completed'
        }).sort({ createdAt: -1 }).limit(20);

        const transactions = rides.map(ride => ({
            id: ride._id,
            amount: ride.fare,
            type: 'credit',
            description: `Ride from ${ride.pickup} to ${ride.destination}`,
            paymentMethod: ride.paymentMethod || 'wallet',
            createdAt: ride.endTime || ride.createdAt,
            rideId: ride._id
        }));

        return res.status(200).json({
            totalEarnings: captain.todayEarnings || 0,
            weeklyEarnings: captain.weeklyEarnings || 0,
            pendingAmount: 0, // Could be calculated based on ongoing rides
            transactions
        });
    } catch (error) {
        return res.status(500).json({ 
            message: 'Failed to fetch wallet data',
            error: error.message 
        });
    }
};

// Get user wallet data
module.exports.getUserWallet = async (req, res) => {
    try {
        const user = await userModel.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.status(200).json({
            balance: user.wallet?.balance || 0,
            transactions: user.wallet?.transactions || [],
            totalSpent: user.totalSpent || 0,
            totalRides: user.totalRides || 0
        });
    } catch (error) {
        return res.status(500).json({ 
            message: 'Failed to fetch wallet data',
            error: error.message 
        });
    }
};

// Auto-deduct from wallet for linked wallets
module.exports.autoDeductFromWallet = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { rideId } = req.body;

    try {
        const ride = await rideModel.findById(rideId).populate('user captain');
        
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        if (ride.status !== 'completed') {
            return res.status(400).json({ message: 'Ride is not completed yet' });
        }

        if (ride.paymentStatus === 'completed') {
            return res.status(400).json({ message: 'Payment already processed' });
        }

        if (!ride.walletLinked) {
            return res.status(400).json({ message: 'Wallet not linked for this ride' });
        }

        const user = await userModel.findById(ride.user._id);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if wallet has sufficient balance
        if (user.wallet.balance < ride.fare) {
            ride.paymentStatus = 'failed';
            await ride.save();
            
            return res.status(400).json({ 
                success: false,
                message: 'Insufficient wallet balance',
                balance: user.wallet.balance,
                required: ride.fare
            });
        }

        // Deduct from user wallet
        user.wallet.balance -= ride.fare;
        user.wallet.transactions.push({
            amount: ride.fare,
            type: 'debit',
            description: `Ride payment from ${ride.pickup.substring(0, 30)} to ${ride.destination.substring(0, 30)}`,
            paymentMethod: 'wallet'
        });
        user.totalSpent = (user.totalSpent || 0) + ride.fare;
        user.totalRides = (user.totalRides || 0) + 1;

        await user.save();

        // Calculate captain earnings (80% of fare)
        const captainEarnings = Math.round(ride.fare * 0.8);
        const captain = await captainModel.findById(ride.captain._id);
        
        if (captain) {
            captain.todayEarnings = (captain.todayEarnings || 0) + captainEarnings;
            captain.weeklyEarnings = (captain.weeklyEarnings || 0) + captainEarnings;
            captain.tripsToday = (captain.tripsToday || 0) + 1;
            captain.weeklyTrips = (captain.weeklyTrips || 0) + 1;
            captain.totalTrips = (captain.totalTrips || 0) + 1;
            await captain.save();
        }

        // Update ride payment status
        ride.paymentStatus = 'completed';
        ride.paymentMethod = 'wallet';
        await ride.save();

        return res.status(200).json({
            success: true,
            message: 'Payment successful',
            balance: user.wallet.balance,
            captainEarnings,
            rideDetails: {
                fare: ride.fare,
                pickup: ride.pickup,
                destination: ride.destination,
                rideId: ride._id
            }
        });
    } catch (error) {
        console.error('Error in auto-deduct from wallet:', error);
        return res.status(500).json({ 
            success: false,
            message: 'Payment processing failed',
            error: error.message 
        });
    }
};

// Process non-wallet payments
module.exports.processNonWalletPayment = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { rideId, paymentMethod, paymentDetails } = req.body;

    try {
        const ride = await rideModel.findById(rideId).populate('user captain');
        
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        if (ride.status !== 'completed') {
            return res.status(400).json({ message: 'Ride is not completed yet' });
        }

        if (ride.paymentStatus === 'completed') {
            return res.status(400).json({ message: 'Payment already processed' });
        }

        const user = await userModel.findById(ride.user._id);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Update user's spending stats
        user.totalSpent = (user.totalSpent || 0) + ride.fare;
        user.totalRides = (user.totalRides || 0) + 1;
        await user.save();

        // Calculate captain earnings (80% of fare)
        const captainEarnings = Math.round(ride.fare * 0.8);
        const captain = await captainModel.findById(ride.captain._id);
        
        if (captain) {
            captain.todayEarnings = (captain.todayEarnings || 0) + captainEarnings;
            captain.weeklyEarnings = (captain.weeklyEarnings || 0) + captainEarnings;
            captain.tripsToday = (captain.tripsToday || 0) + 1;
            captain.weeklyTrips = (captain.weeklyTrips || 0) + 1;
            captain.totalTrips = (captain.totalTrips || 0) + 1;
            await captain.save();
        }

        // Update ride payment status
        ride.paymentStatus = 'completed';
        ride.paymentMethod = paymentMethod;
        if (paymentDetails?.transactionId) {
            ride.paymentID = paymentDetails.transactionId;
        }
        await ride.save();

        return res.status(200).json({
            success: true,
            message: 'Payment successful',
            captainEarnings,
            rideDetails: {
                fare: ride.fare,
                pickup: ride.pickup,
                destination: ride.destination,
                rideId: ride._id,
                paymentMethod
            }
        });
    } catch (error) {
        console.error('Error processing non-wallet payment:', error);
        return res.status(500).json({ 
            success: false,
            message: 'Payment processing failed',
            error: error.message 
        });
    }
};

// Create payment intent for Stripe
module.exports.createPaymentIntent = async (req, res) => {
    try {
        const { amount, rideId, customerName, customerEmail } = req.body;

        console.log('Creating payment intent:', { amount, rideId, customerName, customerEmail });

        if (!amount || !rideId) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Verify ride exists
        const ride = await rideModel.findById(rideId);
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to smallest currency unit
            currency: 'inr',
            metadata: { 
                rideId, 
                customerName, 
                customerEmail,
                userId: req.user._id.toString()
            },
            description: `Orbix Ride Payment - ${ride.pickup} to ${ride.destination}`
        });

        console.log('Payment intent created:', paymentIntent.id);

        // Update ride with payment intent
        ride.paymentIntentId = paymentIntent.id;
        ride.paymentStatus = 'pending';
        await ride.save();

        res.status(200).json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });
    } catch (error) {
        console.error('Create payment intent error:', error);
        res.status(500).json({ 
            message: 'Failed to create payment intent', 
            error: error.message 
        });
    }
};

// Confirm Stripe payment and update ride/captain
module.exports.confirmStripePayment = async (req, res) => {
    try {
        const { rideId, paymentIntentId, amount } = req.body;

        console.log('Confirming Stripe payment:', { rideId, paymentIntentId, amount });

        const ride = await rideModel.findById(rideId);
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        // Update ride payment status
        ride.paymentStatus = 'completed';
        ride.paymentMethod = 'card';
        ride.paymentID = paymentIntentId;
        ride.status = 'completed';
        await ride.save();

        console.log('Ride payment status updated:', ride._id);

        // Update captain earnings
        const captainEarnings = Math.round(amount * 0.8); // 80% to captain
        await captainModel.findByIdAndUpdate(ride.captain, {
            $inc: {
                todayEarnings: captainEarnings,
                weeklyEarnings: captainEarnings,
                tripsToday: 1,
                weeklyTrips: 1,
                totalTrips: 1
            }
        });

        console.log('Captain earnings updated');

        res.status(200).json({ 
            success: true,
            message: 'Payment confirmed successfully', 
            ride 
        });
    } catch (error) {
        console.error('Confirm Stripe payment error:', error);
        res.status(500).json({ 
            message: 'Payment confirmation failed', 
            error: error.message 
        });
    }
};

// Process UPI payment
module.exports.processUPIPayment = async (req, res) => {
    try {
        const { rideId, customerName, customerEmail, amount } = req.body;

        console.log('Processing UPI payment:', { rideId, amount });

        const ride = await rideModel.findById(rideId);
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        // Update ride payment status
        ride.paymentStatus = 'completed';
        ride.paymentMethod = 'upi';
        ride.status = 'completed';
        await ride.save();

        console.log('Ride payment status updated:', ride._id);

        // Update captain earnings
        const captainEarnings = Math.round(amount * 0.8); // 80% to captain
        await captainModel.findByIdAndUpdate(ride.captain, {
            $inc: {
                todayEarnings: captainEarnings,
                weeklyEarnings: captainEarnings,
                tripsToday: 1,
                weeklyTrips: 1,
                totalTrips: 1
            }
        });

        console.log('Captain earnings updated');

        res.status(200).json({ 
            success: true,
            message: 'Payment processed successfully', 
            ride 
        });
    } catch (error) {
        console.error('UPI payment error:', error);
        res.status(500).json({ 
            message: 'Payment processing failed', 
            error: error.message 
        });
    }
};

// Generate HTML email template
const generateEmailTemplate = (rideDetails, paymentDetails) => {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:20px;background-color:#f5f5f5}
.email-container{background-color:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:30px 20px;text-align:center}
.header h1{margin:0;font-size:28px}.success-badge{display:inline-block;background-color:#10b981;color:#fff;padding:5px 15px;border-radius:20px;margin-top:10px}
.content{padding:30px 20px}.section{margin-bottom:25px}.section-title{color:#667eea;font-size:18px;font-weight:bold;margin-bottom:10px;border-bottom:2px solid #667eea;padding-bottom:5px}
.detail-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0}
.detail-label{color:#666;font-weight:500}.detail-value{color:#333;font-weight:600}
.total-section{background-color:#f8f9ff;padding:15px;border-radius:8px;margin-top:20px}
.total-row{display:flex;justify-content:space-between;font-size:20px;font-weight:bold;color:#667eea}
.location-box{background-color:#f8f9ff;padding:12px;border-radius:6px;margin:8px 0;border-left:4px solid #667eea}
.footer{background-color:#f8f9fa;padding:20px;text-align:center;color:#666;font-size:14px}
</style></head><body>
<div class="email-container">
<div class="header"><h1>🚗 Orbix Ride Receipt</h1><p>Thank you for riding with us!</p><span class="success-badge">✓ Payment Successful</span></div>
<div class="content">
<div class="section"><div class="section-title">Customer Information</div>
<div class="detail-row"><span class="detail-label">Name:</span><span class="detail-value">${paymentDetails.customerName}</span></div>
<div class="detail-row"><span class="detail-label">Email:</span><span class="detail-value">${paymentDetails.customerEmail}</span></div>
<div class="detail-row"><span class="detail-label">Date:</span><span class="detail-value">${new Date().toLocaleString()}</span></div>
</div>
<div class="section"><div class="section-title">Ride Details</div>
<div class="detail-row"><span class="detail-label">Ride ID:</span><span class="detail-value">#${rideDetails._id.toString().slice(-8).toUpperCase()}</span></div>
<div class="location-box"><strong>📍 Pickup:</strong><br>${rideDetails.pickup}</div>
<div class="location-box"><strong>🎯 Destination:</strong><br>${rideDetails.destination}</div>

<div class="detail-row"><span class="detail-label">Vehicle:</span><span class="detail-value">${rideDetails.vehicleType || 'N/A'}</span></div>
</div>
<div class="section"><div class="section-title">Payment Details</div>
<div class="detail-row"><span class="detail-label">Method:</span><span class="detail-value">${paymentDetails.paymentMethod}</span></div>
${paymentDetails.paymentIntentId ? `<div class="detail-row"><span class="detail-label">Transaction ID:</span><span class="detail-value">${paymentDetails.paymentIntentId}</span></div>` : ''}
<div class="total-section"><div class="total-row"><span>Total Amount Paid:</span><span>₹${paymentDetails.amount}</span></div></div>
</div></div>
<div class="footer"><p><strong>Thank you for choosing Orbix!</strong></p><p style="margin-top:15px;color:#999;font-size:12px;">This is an automated email. Please do not reply.</p></div>
</div></body></html>`;
};

// Send email receipt
module.exports.sendReceipt = async (req, res) => {
    try {
        const { rideId, customerName, customerEmail, paymentMethod, amount, paymentIntentId } = req.body;

        const ride = await rideModel.findById(rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });

        const htmlContent = generateEmailTemplate(ride, {
            customerName, customerEmail, paymentMethod, amount, paymentIntentId
        });

        // Create transporter
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            }
        });

        await transporter.sendMail({
            from: `"Orbix Rides" <${process.env.EMAIL_USER}>`,
            to: customerEmail,
            subject: `Ride Receipt - Orbix #${ride._id.toString().slice(-8).toUpperCase()}`,
            html: htmlContent
        });

        res.status(200).json({ message: 'Receipt sent successfully', emailSent: true });
    } catch (error) {
        console.error('Send receipt error:', error);
        res.status(500).json({ message: 'Failed to send receipt', error: error.message });
    }
};