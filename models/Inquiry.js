const mongoose = require('mongoose');

const inquirySchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  inquiryNumber: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'quoted', 'accepted', 'rejected', 'cancelled'],
    default: 'pending'
  },
  quotation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quotation'
  },
  files: [{
    originalName: String,
    fileName: String,
    filePath: String,
    fileSize: Number,
    fileType: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  parts: [{
    partRef: String,
    material: {
      type: String,
      required: true
    },
    thickness: {
      type: String,
      required: true
    },
    grade: String,
    quantity: {
      type: Number,
      required: true
    },
    remarks: String,
    price: {
      type: Number,
      default: 0
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
    default: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  deliveryAddress: {
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },
  specialInstructions: String,
  expectedDeliveryDate: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  backOfficeNotes: String,
  customerNotes: String
}, {
  timestamps: true
});

// Generate inquiry number
inquirySchema.pre('validate', function(next) {
  if (this.isNew && !this.inquiryNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.inquiryNumber = `INQ${year}${month}${day}${random}`;
  }
  next();
});

// Also keep the pre-save hook as backup
inquirySchema.pre('save', function(next) {
  if (this.isNew && !this.inquiryNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.inquiryNumber = `INQ${year}${month}${day}${random}`;
  }
  next();
});

// Calculate total amount
inquirySchema.methods.calculateTotal = function() {
  this.totalAmount = this.parts.reduce((total, part) => total + (part.price * part.quantity), 0);
  return this.totalAmount;
};

module.exports = mongoose.model('Inquiry', inquirySchema);
