import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema(
  {
    lender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    borrower: {
      type: String,
      required: true
    },
    borrowerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    amount: {
      type: Number,
      required: [true, 'Please provide the loan amount'],
      min: [1, 'Amount must be at least 1']
    },
    interestRate: {
      type: Number,
      required: [true, 'Please provide the interest rate'],
      min: [0, 'Interest rate cannot be negative']
    },
    startDate: {
      type: Date,
      required: [true, 'Please provide the start date'],
      default: Date.now
    },
    dueDate: {
      type: Date,
      required: [true, 'Please provide the due date']
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'completed', 'overdue', 'defaulted'],
      default: 'active'
    },
    description: {
      type: String,
      required: false
    },
    payments: [
      {
        amount: {
          type: Number,
          required: true
        },
        date: {
          type: Date,
          default: Date.now
        },
        notes: String
      }
    ],
    totalPaid: {
      type: Number,
      default: 0
    },
    remainingAmount: {
      type: Number,
      default: function() {
        return this.amount;
      }
    }
  },
  { timestamps: true }
);

// Calculate remaining amount when a payment is added
TransactionSchema.pre('save', function(next) {
  if (this.isModified('payments')) {
    this.totalPaid = this.payments.reduce((sum, payment) => sum + payment.amount, 0);
    this.remainingAmount = this.amount - this.totalPaid;
    
    // Update status based on payments
    if (this.remainingAmount <= 0) {
      this.status = 'completed';
    } else if (this.dueDate < new Date() && this.status !== 'completed') {
      this.status = 'overdue';
    }
  }
  next();
});

const Transaction = mongoose.model('Transaction', TransactionSchema);

export default Transaction; 