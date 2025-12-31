const captainModel = require('../models/captain.model');

// Middleware to reset daily and weekly earnings if needed
const checkDailyReset = async (req, res, next) => {
    try {
        if (req.captain && req.captain._id) {
            const captain = await captainModel.findById(req.captain._id);
            
            if (captain) {
                const now = new Date();
                const lastDailyReset = new Date(captain.lastEarningsReset);
                const lastWeeklyReset = new Date(captain.lastWeeklyReset);
                
                // Check if it's a new day (compare dates only, not times)
                const isNewDay = now.toDateString() !== lastDailyReset.toDateString();
                
                // Check if it's a new week (check if 7 days have passed)
                const daysSinceWeeklyReset = Math.floor((now - lastWeeklyReset) / (1000 * 60 * 60 * 24));
                const isNewWeek = daysSinceWeeklyReset >= 7;
                
                let needsSave = false;
                
                if (isNewDay) {
                    captain.todayEarnings = 0;
                    captain.tripsToday = 0;
                    captain.lastEarningsReset = now;
                    needsSave = true;
                }
                
                if (isNewWeek) {
                    captain.weeklyEarnings = 0;
                    captain.weeklyTrips = 0;
                    captain.lastWeeklyReset = now;
                    needsSave = true;
                }
                
                if (needsSave) {
                    await captain.save();
                }
            }
        }
        next();
    } catch (error) {
        console.error('Error in daily reset middleware:', error);
        next(); // Continue even if there's an error
    }
};

module.exports = checkDailyReset;
