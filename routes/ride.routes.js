const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const rideController = require('../controllers/ride.controller');
const authMiddleware = require('../middlewares/auth.middleware');


router.post('/create',
    authMiddleware.authUser,
    body('pickup').isString().isLength({ min: 3 }).withMessage('Invalid pickup address'),
    body('destination').isString().isLength({ min: 3 }).withMessage('Invalid destination address'),
    body('vehicleType').isString().isIn([ 'auto', 'car', 'moto' ]).withMessage('Invalid vehicle type'),
    rideController.createRide
)

router.get('/get-fare',
    authMiddleware.authUser,
    query('pickup').isString().isLength({ min: 3 }).withMessage('Invalid pickup address'),
    query('destination').isString().isLength({ min: 3 }).withMessage('Invalid destination address'),
    rideController.getFare
)

// Get user's ride history
router.get('/history',
    authMiddleware.authUser,
    rideController.getRideHistory
)

// Get single ride by ID (user or captain)
router.get('/:rideId',
    authMiddleware.authUser,
    rideController.getRideById
)

// Get current/active rides
router.get('/current',
    authMiddleware.authUser,
    rideController.getCurrentRides
)

// Update ride status
router.patch('/update-status/:rideId',
    authMiddleware.authUser,
    body('status').isString().isIn(['accepted', 'ongoing', 'completed', 'cancelled']).withMessage('Invalid status'),
    rideController.updateRideStatus
)

// Captain routes
router.get('/captain/available',
    authMiddleware.authCaptain,
    rideController.getAvailableRides
)

router.post('/captain/accept/:rideId',
    authMiddleware.authCaptain,
    rideController.acceptRide
)

router.post('/captain/start/:rideId',
    authMiddleware.authCaptain,
    body('otp').isString().isLength({ min: 4, max: 4 }).withMessage('OTP must be 4 digits'),
    rideController.startRide
)

router.post('/captain/complete/:rideId',
    authMiddleware.authCaptain,
    rideController.completeRide
)

router.post('/confirm',
    authMiddleware.authCaptain,
    body('rideId').isMongoId().withMessage('Invalid ride id'),
    rideController.confirmRide
)

// Start ride with OTP
router.post('/start',
    authMiddleware.authCaptain,
    body('rideId').isMongoId().withMessage('Invalid ride id'),
    body('otp').isString().isLength({ min: 4, max: 6 }).withMessage('Invalid OTP'),
    rideController.startRide
)

// End ride
router.post('/end',
    authMiddleware.authCaptain,
    body('rideId').isMongoId().withMessage('Invalid ride id'),
    body('waitingCharges').optional().isNumeric().withMessage('Waiting charges must be a number'),
    rideController.endRide
)

// Rate ride (user only)
router.post('/rate',
    authMiddleware.authUser,
    body('rideId').isMongoId().withMessage('Invalid ride id'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1-5'),
    body('review').optional().isString().withMessage('Review must be a string'),
    rideController.rateRide
)

// Get user ride history
router.get('/user/history',
    authMiddleware.authUser,
    rideController.getUserRideHistory
)

// Get captain ride history  
router.get('/captain/history',
    authMiddleware.authCaptain,
    rideController.getCaptainRideHistory
)

// Captain update ride status (for ride history - change ongoing to cancelled/completed)
router.patch('/captain/update-status/:rideId',
    authMiddleware.authCaptain,
    body('status').isString().isIn(['completed', 'cancelled']).withMessage('Status must be completed or cancelled'),
    rideController.captainUpdateRideStatus
)

module.exports = router;