const dotenv=require("dotenv");
dotenv.config();
const express=require("express");
const cors=require("cors");
const app=express();
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');
const connectToDb=require("./db/db");
const userRoutes=require("./routes/user.routes")
const captainRoutes=require("./routes/captain.routes");
const mapsRoutes=require("./routes/maps.routes");
const rideRoutes=require("./routes/ride.routes");
const paymentRoutes=require("./routes/payment.routes");
const debugRoutes = require('./routes/debug.routes');
connectToDb();

app.use(cors({
  origin: "http://localhost:5173", // your React app URL
  credentials: true,               // allow cookies & headers like Authorization
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"]
}))

app.use(express.json({}))
app.use(express.urlencoded({extended:true}));
app.use(cookieParser());
app.use(fileUpload({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max file size
  abortOnLimit: true,
  responseOnLimit: 'File size limit exceeded (max 5MB)'
}));

app.get("/",(req,res)=>{
    res.send("Hello World")
})

app.use("/users",userRoutes)
app.use("/captains", captainRoutes);
app.use("/maps", mapsRoutes);
app.use("/rides", rideRoutes);
app.use("/payments", paymentRoutes);
app.use('/debug', debugRoutes);

module.exports=app;