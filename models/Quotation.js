const mongoose = require('mongoose');

const quotationSchema = new mongoose.Schema({
  quotationNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  inquiryId: {
    type: String,
    required: true,
    unique: true
  },
  customerInfo: {
    name: {
      type: String,
      required: true
    },
    company: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    phone: {
      type: String,
      required: true
    }
  },
  totalAmount: {
    type: Number,
    required: true
  },
  items: [{
    partRef: String,
    material: String,
    thickness: String,
    grade: String,
    quantity: Number,
    unitPrice: Number,
    totalPrice: Number,
    remark: String
  }],
  quotationPdf: {
    type: String,
    required: false
  },
  status: {
    type: String,
    enum: ['draft', 'created', 'uploaded', 'sent', 'accepted', 'rejected', 'order_created'],
    default: 'draft'
  },
  sentAt: {
    type: Date
  },
  acceptedAt: {
    type: Date
  },
  rejectedAt: {
    type: Date
  },
  rejectionReason: {
    type: String
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  orderCreatedAt: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
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
quotationSchema.pre('save', function(next) {
  if (this.isNew && !this.quotationNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.quotationNumber = `QUO${year}${month}${day}${random}`;
  }
  next();
});

// Index for better query performance
quotationSchema.index({ inquiryId: 1 });
quotationSchema.index({ quotationNumber: 1 });
quotationSchema.index({ 'customerInfo.email': 1 });
quotationSchema.index({ status: 1 });
quotationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Quotation', quotationSchema);