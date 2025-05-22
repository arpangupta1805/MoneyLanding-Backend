import express from 'express';
import { body, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';

const router = express.Router();

// @route   POST /api/transactions
// @desc    Create a new transaction
// @access  Private
router.post(
  '/',
  [
    protect,
    [
      body('borrower', 'Borrower username is required').not().isEmpty(),
      body('amount', 'Amount is required').isNumeric(),
      body('interestRate', 'Interest rate is required').isNumeric(),
      body('dueDate', 'Due date is required').not().isEmpty(),
      body('startDate', 'Start date is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { borrower, amount, interestRate, dueDate, startDate, description } = req.body;

      // Check if borrower username exists in the database
      const borrowerUser = await User.findOne({ username: borrower });
      
      // Create transaction object
      const newTransaction = new Transaction({
        lender: req.user.id,
        borrower,
        amount,
        interestRate,
        startDate: new Date(startDate),
        dueDate: new Date(dueDate),
        description
      });

      // If borrower exists in the database, link their ID
      if (borrowerUser) {
        newTransaction.borrowerId = borrowerUser._id;
      }

      // Save transaction
      const transaction = await newTransaction.save();

      res.status(201).json({
        success: true,
        data: transaction,
        borrowerExists: !!borrowerUser
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

// @route   GET /api/transactions
// @desc    Get all transactions for the logged-in user (as lender)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    // Get transactions where the user is the lender
    const lenderTransactions = await Transaction.find({ lender: req.user.id })
      .sort({ createdAt: -1 });

    // Get transactions where the user is the borrower (by ID)
    const borrowerTransactions = await Transaction.find({ borrowerId: req.user.id })
      .sort({ createdAt: -1 });

    // Get transactions where the user is the borrower (by username)
    const borrowerByUsernameTransactions = await Transaction.find({ 
      borrower: req.user.username,
      borrowerId: { $ne: req.user.id } // Avoid duplicates with borrowerId matches
    }).sort({ createdAt: -1 });

    // Combine all transactions
    const allTransactions = [
      ...lenderTransactions.map(t => ({ ...t.toObject(), role: 'lender' })),
      ...borrowerTransactions.map(t => ({ ...t.toObject(), role: 'borrower' })),
      ...borrowerByUsernameTransactions.map(t => ({ ...t.toObject(), role: 'borrower' }))
    ];

    // Sort by created date (newest first)
    allTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      count: allTransactions.length,
      data: allTransactions
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/transactions/:id
// @desc    Get transaction by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Check if user is authorized to view this transaction
    const isLender = transaction.lender.toString() === req.user.id;
    const isBorrower = 
      (transaction.borrowerId && transaction.borrowerId.toString() === req.user.id) || 
      transaction.borrower === req.user.username;

    if (!isLender && !isBorrower) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to view this transaction'
      });
    }

    res.json({
      success: true,
      data: transaction,
      role: isLender ? 'lender' : 'borrower'
    });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/transactions/:id
// @desc    Update transaction
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    let transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Check if user is the lender of this transaction
    if (transaction.lender.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to update this transaction'
      });
    }

    // Update transaction fields
    const { amount, interestRate, dueDate, startDate, status, description } = req.body;

    if (amount) transaction.amount = amount;
    if (interestRate) transaction.interestRate = interestRate;
    if (dueDate) transaction.dueDate = new Date(dueDate);
    if (startDate) transaction.startDate = new Date(startDate);
    if (status) transaction.status = status;
    if (description) transaction.description = description;

    // If borrower username is updated, check if it exists in the database
    if (req.body.borrower) {
      transaction.borrower = req.body.borrower;
      
      // Check if borrower username exists in the database
      const borrowerUser = await User.findOne({ username: req.body.borrower });
      
      if (borrowerUser) {
        transaction.borrowerId = borrowerUser._id;
      } else {
        transaction.borrowerId = null;
      }
    }

    // Save updated transaction
    await transaction.save();

    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/transactions/:id
// @desc    Delete transaction
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Check if user is the lender of this transaction
    if (transaction.lender.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to delete this transaction'
      });
    }

    await Transaction.findByIdAndRemove(req.params.id);

    res.json({
      success: true,
      message: 'Transaction removed'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/transactions/:id/payment
// @desc    Add payment to transaction
// @access  Private
router.post(
  '/:id/payment',
  [
    protect,
    [
      body('amount', 'Amount is required').isNumeric(),
      body('date', 'Date is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const transaction = await Transaction.findById(req.params.id);

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      // Check if user is authorized to add payment
      const isLender = transaction.lender.toString() === req.user.id;
      const isBorrower = 
        (transaction.borrowerId && transaction.borrowerId.toString() === req.user.id) || 
        transaction.borrower === req.user.username;

      if (!isLender && !isBorrower) {
        return res.status(401).json({
          success: false,
          message: 'Not authorized to add payment to this transaction'
        });
      }

      const { amount, date, notes } = req.body;

      // Add payment to transaction
      transaction.payments.push({
        amount,
        date: new Date(date),
        notes
      });

      // Save updated transaction
      await transaction.save();

      res.json({
        success: true,
        data: transaction
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

// @route   GET /api/transactions/check-borrower/:username
// @desc    Check if borrower username exists and get their details
// @access  Private
router.get('/check-borrower/:username', protect, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    
    if (user) {
      return res.json({
        success: true,
        exists: true,
        user: {
          id: user._id,
          username: user.username,
          fullName: user.fullName,
          fatherName: user.fatherName || '',
          phoneNumber: user.phoneNumber,
          village: user.village,
          address: user.address || ''
        }
      });
    }
    
    res.json({
      success: true,
      exists: false,
      message: 'Username not found. Do you want to continue with this username?'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/transactions/check-phone/:phoneNumber
// @desc    Check if borrower phone number exists and get their details
// @access  Private
router.get('/check-phone/:phoneNumber', protect, async (req, res) => {
  try {
    const user = await User.findOne({ phoneNumber: req.params.phoneNumber });
    
    if (user) {
      return res.json({
        success: true,
        exists: true,
        user: {
          id: user._id,
          username: user.username,
          fullName: user.fullName,
          fatherName: user.fatherName || '',
          phoneNumber: user.phoneNumber,
          village: user.village,
          address: user.address || ''
        }
      });
    }
    
    res.json({
      success: true,
      exists: false,
      message: 'Phone number not found. Do you want to continue with this phone number?'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

export default router; 