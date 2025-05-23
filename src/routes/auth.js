import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/emailService.js';

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register user
// @access  Public
router.post(
  '/register',
  [
    body('username', 'Username is required').not().isEmpty().trim(),
    body('email', 'Please include a valid email').isEmail(),
    body('password', 'Password must be at least 6 characters').isLength({ min: 6 }),
    body('fullName', 'Full name is required').not().isEmpty(),
    body('phoneNumber', 'Phone number is required').not().isEmpty(),
    body('village', 'Village name is required').not().isEmpty()
  ],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, fullName, phoneNumber, village, address, fatherName } = req.body;

    try {
      // Check if user already exists
      let user = await User.findOne({ email });
      if (user) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists'
        });
      }

      // Check if username is taken
      user = await User.findOne({ username });
      if (user) {
        return res.status(400).json({
          success: false,
          message: 'Username is already taken'
        });
      }

      // Create user
      user = new User({
        username,
        email,
        password,
        fullName,
        phoneNumber,
        village,
        address,
        fatherName
      });

      // Generate email verification token
      const verificationToken = user.getEmailVerificationToken();
      
      await user.save();

      // Send verification email
      await sendVerificationEmail(email, fullName, verificationToken);

      res.status(201).json({
        success: true,
        message: 'Registration successful! Please check your email for verification OTP.',
        userId: user._id
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }
);

// @route   POST /api/auth/verify-email
// @desc    Verify email with OTP
// @access  Public
router.post(
  '/verify-email',
  [
    body('userId', 'User ID is required').not().isEmpty(),
    body('otp', 'OTP is required').isLength({ min: 6, max: 6 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId, otp } = req.body;

    try {
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if OTP matches and is not expired
      if (
        user.emailVerificationToken !== otp ||
        user.emailVerificationExpire < Date.now()
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired OTP'
        });
      }

      // Check if this is a pending email verification
      const isEmailChange = !!user.pendingEmail;
      
      if (isEmailChange) {
        // This is an email change verification
        // Update the primary email with the pending email
        user.email = user.pendingEmail;
        user.pendingEmail = undefined; // Clear pending email
      }
      
      // Mark email as verified and clear verification fields
      user.isEmailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpire = undefined;

      await user.save();

      // Generate JWT
      const token = user.getSignedJwtToken();

      res.json({
        success: true,
        message: isEmailChange ? 'Email updated and verified successfully' : 'Email verified successfully',
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          phoneNumber: user.phoneNumber,
          village: user.village,
          address: user.address,
          fatherName: user.fatherName,
          role: user.role,
          isEmailVerified: user.isEmailVerified
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }
);

// @route   POST /api/auth/resend-verification
// @desc    Resend email verification OTP
// @access  Public
router.post(
  '/resend-verification',
  [body('userId', 'User ID is required').not().isEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.body;

    try {
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (user.isEmailVerified) {
        return res.status(400).json({
          success: false,
          message: 'Email is already verified'
        });
      }

      // Generate new verification token
      const verificationToken = user.getEmailVerificationToken();
      await user.save();

      // Send verification email
      await sendVerificationEmail(user.email, user.fullName, verificationToken);

      res.json({
        success: true,
        message: 'Verification OTP resent to your email'
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }
);

// @route   POST /api/auth/login
// @desc    Login user & get token
// @access  Public
router.post(
  '/login',
  [
    body('username', 'Username is required').not().isEmpty(),
    body('password', 'Password is required').exists()
  ],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    try {
      // Check if user exists
      const user = await User.findOne({ username }).select('+password');
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check if password matches
      const isMatch = await user.matchPassword(password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check if email is verified
      if (!user.isEmailVerified) {
        // Generate new verification token
        const verificationToken = user.getEmailVerificationToken();
        await user.save();

        // Send verification email
        await sendVerificationEmail(user.email, user.fullName, verificationToken);

        return res.status(200).json({
          success: false,
          message: 'Email not verified. A new verification OTP has been sent to your email.',
          userId: user._id,
          requiresVerification: true,
          email: user.email,
          fullName: user.fullName
        });
      }

      // Generate JWT
      const token = user.getSignedJwtToken();

      res.json({
        success: true,
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          phoneNumber: user.phoneNumber,
          village: user.village,
          address: user.address,
          fatherName: user.fatherName,
          role: user.role
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }
);

// @route   POST /api/auth/forgot-password
// @desc    Send password reset OTP
// @access  Public
router.post(
  '/forgot-password',
  [body('email', 'Please include a valid email').isEmail()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    try {
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User with this email does not exist'
        });
      }

      // Generate reset token
      const resetToken = user.getResetPasswordToken();
      await user.save();

      // Send password reset email
      await sendPasswordResetEmail(user.email, user.fullName, resetToken);

      res.json({
        success: true,
        message: 'Password reset OTP sent to your email',
        userId: user._id
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }
);

// @route   POST /api/auth/reset-password
// @desc    Reset password with OTP
// @access  Public
router.post(
  '/reset-password',
  [
    body('userId', 'User ID is required').not().isEmpty(),
    body('otp', 'OTP is required').isLength({ min: 6, max: 6 }),
    body('password', 'Password must be at least 6 characters').isLength({ min: 6 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId, otp, password } = req.body;

    try {
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if OTP matches and is not expired
      if (
        user.resetPasswordToken !== otp ||
        user.resetPasswordExpire < Date.now()
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired OTP'
        });
      }

      // Update password and clear reset fields
      user.password = password;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;

      await user.save();

      res.json({
        success: true,
        message: 'Password reset successful'
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }
);

// @route   GET /api/auth/me
// @desc    Get current logged in user
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        village: user.village,
        address: user.address,
        fatherName: user.fatherName,
        role: user.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/auth/check-username
// @desc    Check if username is available
// @access  Public
router.post('/check-username', 
  [body('username', 'Username is required').not().isEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { username } = req.body;
      const user = await User.findOne({ username });
      
      res.json({
        success: true,
        available: !user
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }
);

// @route   POST /api/auth/validate-password
// @desc    Validate password strength
// @access  Public
router.post('/validate-password',
  [body('password', 'Password is required').exists()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { password } = req.body;
    
    // Password strength validation
    const validations = {
      minLength: password.length >= 8,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
    
    const strength = Object.values(validations).filter(Boolean).length;
    
    let strengthLevel = 'weak';
    if (strength >= 5) {
      strengthLevel = 'strong';
    } else if (strength >= 3) {
      strengthLevel = 'medium';
    }
    
    res.json({
      success: true,
      validations,
      strengthLevel,
      isStrong: strengthLevel === 'strong'
    });
  }
);

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put(
  '/profile',
  protect,
  [
    body('fullName', 'Full name is required').optional().not().isEmpty(),
    body('phoneNumber', 'Phone number is required').optional().not().isEmpty(),
    body('village', 'Village name is required').optional().not().isEmpty(),
    body('address').optional(),
    body('fatherName').optional(),
    body('email', 'Please include a valid email').optional().isEmail()
  ],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { fullName, phoneNumber, village, address, fatherName, email } = req.body;

      // If email is being updated, check if it's already in use
      if (email && email !== req.user.email) {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: 'Email already in use by another account'
          });
        }
      }

      // Build profile update object
      const profileFields = {};
      if (fullName) profileFields.fullName = fullName;
      if (phoneNumber) profileFields.phoneNumber = phoneNumber;
      if (village) profileFields.village = village;
      if (address !== undefined) profileFields.address = address;
      if (fatherName !== undefined) profileFields.fatherName = fatherName;
      
      // Handle email update separately (if provided)
      let updatedUser;
      if (email && email !== req.user.email) {
        // Get the user and set pendingEmail
        updatedUser = await User.findById(req.user.id);
        updatedUser.pendingEmail = email; // Store in pendingEmail, don't change primary email yet
        
        // Generate verification token
        const verificationToken = updatedUser.getEmailVerificationToken();
        
        // Apply other profile updates
        if (fullName) updatedUser.fullName = fullName;
        if (phoneNumber) updatedUser.phoneNumber = phoneNumber;
        if (village) updatedUser.village = village;
        if (address !== undefined) updatedUser.address = address;
        if (fatherName !== undefined) updatedUser.fatherName = fatherName;
        
        await updatedUser.save();
        
        // Send verification email to the new/pending email
        await sendVerificationEmail(email, updatedUser.fullName, verificationToken);
        
        return res.json({
          success: true,
          message: 'Profile updated. Please verify your new email address.',
          requiresVerification: true,
          userId: updatedUser._id,
          user: {
            id: updatedUser._id,
            username: updatedUser.username,
            email: updatedUser.email, // Return current email
            pendingEmail: updatedUser.pendingEmail, // Also return pending email
            fullName: updatedUser.fullName,
            phoneNumber: updatedUser.phoneNumber,
            village: updatedUser.village,
            address: updatedUser.address,
            fatherName: updatedUser.fatherName,
            role: updatedUser.role,
            isEmailVerified: updatedUser.isEmailVerified
          }
        });
      } else {
        // Regular update without email change
        updatedUser = await User.findByIdAndUpdate(
          req.user.id,
          { $set: profileFields },
          { new: true, runValidators: true }
        );
        
        return res.json({
          success: true,
          message: 'Profile updated successfully',
          user: {
            id: updatedUser._id,
            username: updatedUser.username,
            email: updatedUser.email,
            pendingEmail: updatedUser.pendingEmail,
            fullName: updatedUser.fullName,
            phoneNumber: updatedUser.phoneNumber,
            village: updatedUser.village,
            address: updatedUser.address,
            fatherName: updatedUser.fatherName,
            role: updatedUser.role,
            isEmailVerified: updatedUser.isEmailVerified
          }
        });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }
);

export default router; 