const mongoose = require('mongoose');

const quotationSchema = new mongoose.Schema({
  inquiry: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Inquiry',
    required: true
  },
  quotationNumber: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['draft', 'sent', 'accepted', 'rejected', 'expired', 'order_created'],
    default: 'draft'
  },
  parts: [{
    partRef: String,
    material: String,
    thickness: String,
    quantity: Number,
    remarks: String,
    unitPrice: {
      type: Number,
      required: true
    },
    totalPrice: {
      type: Number,
      required: true
    },
    created: {
      type: Date,
      default: Date.now
    },
    modified: {
      type: Date,
      default: Date.now
    }
  }],
  totalAmount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  validUntil: {
    type: Date,
    required: true
  },
  terms: {
    type: String,
    default: 'Standard manufacturing terms apply. Payment required before production begins.'
  },
  notes: String,
  isUploadQuotation: {
    type: Boolean,
    default: false
  },
  preparedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sentAt: Date,
  acceptedAt: Date,
  rejectedAt: Date,
  orderCreatedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Generate quotation number
quotationSchema.pre('validate', function(next) {
  if (this.isNew && !this.quotationNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.quotationNumber = `QT${year}${month}${day}${random}`;
  }
  next();
});

// Calculate total amount
quotationSchema.methods.calculateTotal = function() {
  this.totalAmount = this.parts.reduce((total, part) => total + part.totalPrice, 0);
  return this.totalAmount;
};

// Set default validity (30 days from creation)
quotationSchema.pre('save', function(next) {
  if (this.isNew && !this.validUntil) {
    this.validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  }
  next();
});

module.exports = mongoose.model('Quotation', quotationSchema);
