const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const paymentController = require('../controllers/payment.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Get wallet details
router.get('/wallet', authMiddleware.authUser, paymentController.getWallet);

// Add money to wallet via Razorpay
router.post('/wallet/add-money/razorpay',
    authMiddleware.authUser,
    body('amount').isNumeric().isFloat({ min: 1 }).withMessage('Amount must be a positive number'),
    body('paymentDetails').optional(),
    paymentController.addMoneyViaRazorpay
);

// Add money to wallet via PhonePe
router.post('/wallet/add-money/phonepe',
    authMiddleware.authUser,
    body('amount').isNumeric().isFloat({ min: 1 }).withMessage('Amount must be a positive number'),
    body('paymentDetails').optional(),
    paymentController.addMoneyViaPhonePe
);

// Process ride payment
router.post('/ride-payment',
    authMiddleware.authUser,
    body('rideId').isString().notEmpty().withMessage('Ride ID is required'),
    body('amount').isNumeric().isFloat({ min: 1 }).withMessage('Amount must be a positive number'),
    body('paymentMethod').isString().isIn(['wallet', 'razorpay', 'phonepe']).withMessage('Invalid payment method'),
    paymentController.processRidePayment
);

// Get wallet discount calculation
router.get('/wallet/discount',
    authMiddleware.authUser,
    paymentController.getWalletDiscount
);

// QR Payment processing (Captain only)
router.post('/process-ride-payment',
    authMiddleware.authCaptain,
    body('amount').isNumeric().isFloat({ min: 1 }).withMessage('Amount must be a positive number'),
    body('rideId').optional().isString(),
    body('description').optional().isString(),
    body('paymentMethod').optional().isString(),
    paymentController.processRidePayment
);

// Get captain wallet data
router.get('/captain/wallet',
    authMiddleware.authCaptain,
    paymentController.getCaptainWallet
);

// Get user wallet data  
router.get('/user/wallet',
    authMiddleware.authUser,
    paymentController.getUserWallet
);

// Auto-deduct from wallet for linked wallets
router.post('/wallet/auto-deduct',
    authMiddleware.authUser,
    body('rideId').isString().notEmpty().withMessage('Ride ID is required'),
    paymentController.autoDeductFromWallet
);

// Process non-wallet payments (UPI, Card, Cash, Net Banking)
router.post('/payment/process',
    authMiddleware.authUser,
    body('rideId').isString().notEmpty().withMessage('Ride ID is required'),
    body('paymentMethod').isString().isIn(['upi', 'card', 'cash', 'netbanking']).withMessage('Invalid payment method'),
    body('paymentDetails').optional(),
    paymentController.processNonWalletPayment
);

// ============ NEW STRIPE AND EMAIL ROUTES ============

// Create Stripe payment intent
router.post('/create-payment-intent',
    authMiddleware.authUser,
    body('amount').isNumeric().withMessage('Amount is required'),
    body('rideId').isString().notEmpty().withMessage('Ride ID is required'),
    paymentController.createPaymentIntent
);

// Confirm Stripe payment and update ride
router.post('/confirm-stripe-payment',
    authMiddleware.authUser,
    body('rideId').isString().notEmpty().withMessage('Ride ID is required'),
    body('paymentIntentId').isString().notEmpty().withMessage('Payment Intent ID is required'),
    body('amount').isNumeric().withMessage('Amount is required'),
    paymentController.confirmStripePayment
);

// Process UPI payment
router.post('/process-upi',
    authMiddleware.authUser,
    body('rideId').isString().notEmpty().withMessage('Ride ID is required'),
    body('amount').isNumeric().withMessage('Amount is required'),
    paymentController.processUPIPayment
);

// Send email receipt
router.post('/send-receipt',
    authMiddleware.authUser,
    body('rideId').isString().notEmpty().withMessage('Ride ID is required'),
    body('customerEmail').isEmail().withMessage('Valid email is required'),
    paymentController.sendReceipt
);

module.exports = router;
