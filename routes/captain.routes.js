
const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const captainController = require('../controllers/captain.controller');
const authMiddleware=require("../middlewares/auth.middleware");
const checkDailyReset = require("../middlewares/dailyReset.middleware");


router.post('/register', [
    body('email').isEmail().withMessage('Invalid Email'),
    body('fullname.firstname').isLength({ min: 3 }).withMessage('First name must be at least 3 characters long'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
    body('vehicle.color').isLength({ min: 3 }).withMessage('Color must be at least 3 characters long'),
    body('vehicle.plate').isLength({ min: 3 }).withMessage('Plate must be at least 3 characters long'),
    body('vehicle.capacity').isInt({ min: 1 }).withMessage('Capacity must be at least 1'),
    body('vehicle.vehicleType').isIn(['car', 'moto', 'auto']).withMessage('Vehicle type must be one of: car, moto, auto') ,
], captainController.createCaptain);


router.post('/login', [
    body('email').isEmail().withMessage('Invalid Email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
], captainController.loginCaptain);

router.get('/profile', authMiddleware.authCaptain, checkDailyReset, captainController.getCaptainProfile);

router.post('/upload-profile-image', authMiddleware.authCaptain, captainController.uploadProfileImage);

router.put('/profile', authMiddleware.authCaptain, captainController.updateCaptainProfile);

router.get('/logout', authMiddleware.authCaptain, captainController.logoutCaptain);

router.patch('/status', authMiddleware.authCaptain, checkDailyReset, captainController.updateCaptainStatus);

router.get('/stats', authMiddleware.authCaptain, checkDailyReset, captainController.getCaptainStats);

router.patch('/vehicle', authMiddleware.authCaptain, captainController.updateVehicle);

router.patch('/update-stats', authMiddleware.authCaptain, captainController.updateCaptainStats);

router.post('/reset-daily-earnings', authMiddleware.authCaptain, captainController.resetDailyEarnings);


module.exports = router