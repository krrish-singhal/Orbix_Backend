const userModel = require("../models/user.model");
const userService = require('../service/user.service');
const { validationResult } = require('express-validator');
const blackListTokenModel = require('../models/blacklist.model');
const bcrypt = require("bcryptjs");

// Register User
const registerUser = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { fullname, email, password } = req.body;

  const isUserExists = await userModel.findOne({ email });
  if (isUserExists) {
    return res.status(400).json({ message: 'User already exists' });
  }

  const hashedPassword = await userModel.hashPassword(password);

  const user = await userService.createUser({
    firstname: fullname.firstname,
    lastname: fullname.lastname,
    email,
    password: hashedPassword
  });

  const token = user.generateAuthToken();

  res.status(201).json({ token, user });
};

// Login User
const loginUser = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  const user = await userModel.findOne({ email }).select('+password');

  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const token = user.generateAuthToken();

  res.cookie('token', token);

  res.status(200).json({ token, user });
};

// Get User Profile
const getUserProfile = async (req, res) => {
  res.status(200).json({ user: req.user });
};

// Update User Profile
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { firstname, lastname, email, phone } = req.body;
    let updateData = {
      "fullname.firstname": firstname,
      "fullname.lastname": lastname,
      email,
      phone
    };

    // Handle profile image upload if present
    if (req.file || req.files?.profileImage) {
      const profileImage = req.file ? req.file.path : req.files.profileImage[0].path;
      updateData.profileImage = profileImage;
    }

    const updatedUser = await userModel.findByIdAndUpdate(userId, updateData, { new: true });
    res.status(200).json({ user: updatedUser });
  } catch (error) {
    res.status(500).json({ message: "Failed to update profile", error: error.message });
  }
};

// Change Password
const changePassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { oldPassword, newPassword } = req.body;

    const user = await userModel.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Old password is incorrect" });
    }

    user.password = await userModel.hashPassword(newPassword);
    await user.save();

    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to change password", error: error.message });
  }
};

// Delete Account
const deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;
    await userModel.findByIdAndDelete(userId);
    res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete account", error: error.message });
  }
};

// Logout User
const logoutUser = async (req, res) => {
  res.clearCookie('token');
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  await blackListTokenModel.create({ token });
  res.status(200).json({ message: 'Logged out successfully' });
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  changePassword,
  deleteAccount,
  logoutUser
};
