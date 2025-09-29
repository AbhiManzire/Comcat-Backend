const express = require('express');
const { body, validationResult } = require('express-validator');
const Quotation = require('../models/Quotation');
const Inquiry = require('../models/Inquiry');
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const { sendQuotationEmail } = require('../services/emailService');

const router = express.Router();

// Import middleware from auth.js
const { authenticateToken, requireBackOffice, requireQuotationPermission } = require('../middleware/auth');

// Quotation response (Accept/Reject) - Customer
router.post('/:id/response', authenticateToken, [
  body('response').isIn(['accepted', 'rejected']).withMessage('Response must be accepted or rejected'),
  body('notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { response, notes } = req.body;
    const quotationId = req.params.id;

    // Find quotation
    const quotation = await Quotation.findById(quotationId)
      .populate('inquiry', 'customer')
      .populate('inquiry.customer', 'firstName lastName email companyName');

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found'
      });
    }

    console.log('Debug - Quotation found:', {
      quotationId: quotation._id,
      inquiryId: quotation.inquiry?._id,
      customerId: quotation.inquiry?.customer?._id,
      customerData: quotation.inquiry?.customer
    });

    // Check if inquiry and customer exist
    if (!quotation.inquiry || !quotation.inquiry.customer) {
      console.log('Error - Missing inquiry or customer data:', {
        hasInquiry: !!quotation.inquiry,
        hasCustomer: !!quotation.inquiry?.customer
      });
      return res.status(500).json({
        success: false,
        message: 'Quotation data is incomplete'
      });
    }

    // Check user role - customers and admins can respond to quotations
    console.log('Debug - User role check:', {
      userRole: req.userRole,
      userId: req.userId
    });
    
    if (!['customer', 'admin'].includes(req.userRole)) {
      console.log('Access denied - Only customers and admins can respond to quotations:', {
        userRole: req.userRole,
        userId: req.userId
      });
      return res.status(403).json({
        success: false,
        message: 'Only customers and admins can respond to quotations.'
      });
    }

    // Check ownership - customers can only respond to their own quotations, admins can respond to any
    const quotationCustomerId = quotation.inquiry.customer._id.toString();
    const requestUserId = req.userId.toString();
    
    console.log('Debug - Quotation ownership check:', {
      quotationCustomerId,
      requestUserId,
      userRole: req.userRole,
      userIdType: typeof req.userId,
      customerIdType: typeof quotation.inquiry.customer._id,
      areEqual: quotationCustomerId === requestUserId,
      quotationCustomerIdLength: quotationCustomerId.length,
      requestUserIdLength: requestUserId.length
    });
    
    // If user is customer, they can only respond to their own quotations
    // If user is admin, they can respond to any quotation
    if (req.userRole === 'customer' && quotationCustomerId !== requestUserId) {
      console.log('Access denied - Customer can only respond to their own quotations:', {
        quotationCustomerId,
        requestUserId,
        quotationCustomerIdLength: quotationCustomerId.length,
        requestUserIdLength: requestUserId.length
      });
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only respond to your own quotations.'
      });
    }

    // Check if quotation is in sent status
    if (quotation.status !== 'sent') {
      return res.status(400).json({
        success: false,
        message: 'Quotation is not in sent status'
      });
    }

    // Update quotation status
    quotation.status = response;
    quotation.customerResponse = {
      response: response,
      notes: notes || '',
      respondedAt: new Date()
    };

    await quotation.save();

    // Create notification for back office users about customer response
    try {
      const User = require('../models/User');
      const backOfficeUsers = await User.find({ role: { $in: ['admin', 'backoffice'] } });
      
      for (const user of backOfficeUsers) {
        await Notification.createNotification({
          title: `Quotation ${response === 'accepted' ? 'Accepted' : 'Rejected'}`,
          message: `Customer ${quotation.inquiry.customer.firstName} ${quotation.inquiry.customer.lastName} has ${response} quotation ${quotation.quotationNumber} for inquiry ${quotation.inquiry.inquiryNumber}.${notes ? ` Notes: ${notes}` : ''}`,
          type: response === 'accepted' ? 'success' : 'warning',
          userId: user._id,
          relatedEntity: {
            type: 'quotation',
            entityId: quotation._id
          },
          metadata: {
            quotationNumber: quotation.quotationNumber,
            inquiryNumber: quotation.inquiry.inquiryNumber,
            customerName: `${quotation.inquiry.customer.firstName} ${quotation.inquiry.customer.lastName}`,
            customerEmail: quotation.inquiry.customer.email,
            response: response,
            notes: notes
          }
        });
      }
      
      console.log(`Created ${response} notification for ${backOfficeUsers.length} back office users`);
    } catch (notificationError) {
      console.error('Failed to create back office notification:', notificationError);
    }

    // If accepted, create order
    if (response === 'accepted') {
      // Check if order already exists for this quotation
      const existingOrder = await Order.findOne({ quotation: quotationId });
      
      if (existingOrder) {
        console.log('Order already exists for quotation:', quotationId);
        return res.json({
          success: true,
          message: 'Quotation already accepted. Order exists.',
          order: existingOrder
        });
      }

      // Ensure deliveryAddress is always a valid object
      let deliveryAddress = {
        street: '',
        city: '',
        state: '',
        country: '',
        zipCode: ''
      };
      
      if (quotation.inquiry && quotation.inquiry.deliveryAddress) {
        deliveryAddress = {
          street: quotation.inquiry.deliveryAddress.street || '',
          city: quotation.inquiry.deliveryAddress.city || '',
          state: quotation.inquiry.deliveryAddress.state || '',
          country: quotation.inquiry.deliveryAddress.country || '',
          zipCode: quotation.inquiry.deliveryAddress.zipCode || ''
        };
      }

      const order = new Order({
        quotation: quotationId,
        customer: req.userId,
        inquiry: quotation.inquiry._id,
        orderNumber: `ORD${Date.now()}`,
        parts: quotation.parts,
        totalAmount: quotation.totalAmount,
        currency: quotation.currency || 'USD',
        status: 'pending',
        payment: {
          method: 'pending', // Set to pending initially
          status: 'pending',
          transactionId: null,
          paidAt: null
        },
        deliveryAddress: deliveryAddress
      });

      await order.save();

      // Update inquiry status
      await Inquiry.findByIdAndUpdate(quotation.inquiry._id, { status: 'quoted' });

      res.json({
        success: true,
        message: 'Quotation accepted successfully. Order created.',
        order: order
      });
    } else {
      // Update inquiry status to rejected
      await Inquiry.findByIdAndUpdate(quotation.inquiry._id, { status: 'rejected' });

      res.json({
        success: true,
        message: 'Quotation rejected successfully.'
      });
    }

  } catch (error) {
    console.error('Quotation response error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      quotationId: req.params.id,
      userId: req.userId,
      response: req.body.response
    });
    
    // Always show detailed error in development
    const errorMessage = process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong';
    const errorStack = process.env.NODE_ENV === 'development' ? error.stack : undefined;
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: errorMessage,
      ...(errorStack && { stack: errorStack })
    });
  }
});

// Create quotation from inquiry (Back Office with permission check)
router.post('/', authenticateToken, requireQuotationPermission, [
  body('inquiryId').notEmpty().withMessage('Inquiry ID is required'),
  body('parts').isArray().withMessage('Parts must be an array'),
  body('parts.*.partRef').optional().notEmpty().withMessage('Part reference is required'),
  body('parts.*.unitPrice').optional().isFloat({ min: 0 }).withMessage('Valid unit price is required'),
  body('parts.*.quantity').optional().isInt({ min: 1 }).withMessage('Valid quantity is required'),
  body('totalAmount').isFloat({ min: 0 }).withMessage('Valid total amount is required'),
  body('terms').optional().isString(),
  body('notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { inquiryId, parts, totalAmount, terms, notes, validUntil, isUploadQuotation } = req.body;

    // Check if inquiry exists
    const inquiry = await Inquiry.findById(inquiryId);
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found'
      });
    }

    // Handle parts and total amount based on mode
    let processedParts = [];
    let finalTotalAmount = 0;

    if (isUploadQuotation) {
      // Upload quotation mode - use provided total amount
      processedParts = [];
      finalTotalAmount = totalAmount;
    } else {
      // Manual entry mode - calculate from parts
      processedParts = parts.map(part => ({
        ...part,
        totalPrice: part.unitPrice * part.quantity,
        created: new Date(),
        modified: new Date()
      }));
      finalTotalAmount = processedParts.reduce((total, part) => total + part.totalPrice, 0);
    }

    // Check if quotation already exists for this inquiry
    const existingQuotation = await Quotation.findOne({ inquiry: inquiryId });
    if (existingQuotation) {
      // If quotation exists and is in draft status, update it
      if (existingQuotation.status === 'draft') {
        // Update existing quotation
        existingQuotation.parts = processedParts;
        existingQuotation.totalAmount = finalTotalAmount;
        existingQuotation.terms = terms || 'Standard manufacturing terms apply. Payment required before production begins.';
        existingQuotation.notes = notes;
        existingQuotation.validUntil = validUntil ? new Date(validUntil) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        existingQuotation.isUploadQuotation = isUploadQuotation || false;
        existingQuotation.updatedAt = new Date();
        
        await existingQuotation.save();
        
        return res.json({
          success: true,
          message: 'Quotation updated successfully',
          quotation: {
            id: existingQuotation._id,
            quotationNumber: existingQuotation.quotationNumber,
            totalAmount: existingQuotation.totalAmount,
            status: existingQuotation.status
          }
        });
      } else {
        // Quotation exists and is not in draft status
        return res.status(400).json({
          success: false,
          message: 'Quotation already exists for this inquiry and cannot be modified',
          existingQuotation: {
            id: existingQuotation._id,
            quotationNumber: existingQuotation.quotationNumber,
            status: existingQuotation.status
          }
        });
      }
    }

    // Create quotation
    const quotation = new Quotation({
      inquiry: inquiryId,
      parts: processedParts,
      totalAmount: finalTotalAmount,
      terms: terms || 'Standard manufacturing terms apply. Payment required before production begins.',
      notes,
      validUntil: validUntil ? new Date(validUntil) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      preparedBy: req.userId,
      isUploadQuotation: isUploadQuotation || false
    });

    await quotation.save();

    // Update inquiry status and add quotation reference
    inquiry.status = 'quoted';
    inquiry.quotation = quotation._id;
    await inquiry.save();

    res.status(201).json({
      success: true,
      message: 'Quotation created successfully',
      quotation: {
        id: quotation._id,
        quotationNumber: quotation.quotationNumber,
        totalAmount: quotation.totalAmount,
        status: quotation.status
      }
    });

  } catch (error) {
    console.error('Create quotation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
});

// Get customer quotations (Customer access)
router.get('/customer', authenticateToken, async (req, res) => {
  try {
    // Only allow customers to access their own quotations
    if (req.userRole !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Customer access required'
      });
    }

    const quotations = await Quotation.find()
      .populate({
        path: 'inquiry',
        select: 'inquiryNumber customer files parts deliveryAddress specialInstructions',
        populate: {
          path: 'customer',
          select: 'firstName lastName email companyName phoneNumber',
          match: { _id: req.userId }
        }
      })
      .populate('preparedBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    // Filter out quotations where customer doesn't match
    const customerQuotations = quotations.filter(quotation => 
      quotation.inquiry && quotation.inquiry.customer
    );

    res.json({
      success: true,
      quotations: customerQuotations
    });

  } catch (error) {
    console.error('Get customer quotations error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get all quotations (Back Office with permission check)
router.get('/', authenticateToken, requireBackOffice, async (req, res) => {
  try {
    const quotations = await Quotation.find()
      .populate({
        path: 'inquiry',
        select: 'inquiryNumber customer files parts deliveryAddress specialInstructions',
        populate: {
          path: 'customer',
          select: 'firstName lastName email companyName phoneNumber'
        }
      })
      .populate('preparedBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      quotations
    });

  } catch (error) {
    console.error('Get quotations error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get quotation by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id)
      .populate({
        path: 'inquiry',
        select: 'inquiryNumber customer files parts deliveryAddress specialInstructions',
        populate: {
          path: 'customer',
          select: 'firstName lastName email companyName phoneNumber'
        }
      })
      .populate('preparedBy', 'firstName lastName');

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found'
      });
    }

    res.json({
      success: true,
      quotation
    });

  } catch (error) {
    console.error('Get quotation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update quotation (Back Office with permission check)
router.put('/:id', authenticateToken, requireQuotationPermission, [
  body('parts').isArray({ min: 1 }).withMessage('At least one part is required'),
  body('parts.*.unitPrice').isFloat({ min: 0 }).withMessage('Valid unit price is required'),
  body('terms').optional().isString(),
  body('notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { parts, terms, notes, validUntil } = req.body;

    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found'
      });
    }

    // Update parts with new pricing
    const processedParts = parts.map(part => ({
      ...part,
      totalPrice: part.unitPrice * part.quantity,
      modified: new Date()
    }));

    // Calculate new total
    const totalAmount = processedParts.reduce((total, part) => total + part.totalPrice, 0);

    quotation.parts = processedParts;
    quotation.totalAmount = totalAmount;
    if (terms) quotation.terms = terms;
    if (notes) quotation.notes = notes;
    if (validUntil) quotation.validUntil = new Date(validUntil);
    quotation.updatedAt = new Date();

    await quotation.save();

    res.json({
      success: true,
      message: 'Quotation updated successfully',
      quotation: {
        id: quotation._id,
        quotationNumber: quotation.quotationNumber,
        totalAmount: quotation.totalAmount,
        status: quotation.status
      }
    });

  } catch (error) {
    console.error('Update quotation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Send quotation to customer (Back Office with permission check)
router.post('/:id/send', authenticateToken, requireQuotationPermission, async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id)
      .populate({
        path: 'inquiry',
        select: 'customer files parts deliveryAddress specialInstructions inquiryNumber',
        populate: {
          path: 'customer',
          select: 'firstName lastName email companyName phoneNumber'
        }
      });

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found'
      });
    }

    if (quotation.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Quotation can only be sent from draft status'
      });
    }

    // Check if customer data is available
    if (!quotation.inquiry || !quotation.inquiry.customer) {
      return res.status(400).json({
        success: false,
        message: 'Customer information not found for this quotation'
      });
    }

    console.log('Sending quotation to customer:', {
      quotationId: quotation._id,
      quotationNumber: quotation.quotationNumber,
      customerEmail: quotation.inquiry.customer.email,
      customerPhone: quotation.inquiry.customer.phoneNumber,
      customerName: `${quotation.inquiry.customer.firstName} ${quotation.inquiry.customer.lastName}`
    });

    // Send quotation email
    try {
      await sendQuotationEmail(quotation);
      console.log('Quotation email sent successfully to:', quotation.inquiry.customer.email);
    } catch (emailError) {
      console.error('Quotation email failed:', emailError);
      // Don't fail the operation if email fails, but log the error
    }

    // Create notification for customer
    try {
      await Notification.createNotification({
        title: 'Quotation Ready',
        message: `Your quotation ${quotation.quotationNumber} is ready for inquiry ${quotation.inquiry.inquiryNumber}. Total amount: ${quotation.currency} ${quotation.totalAmount}. Please review and respond.`,
        type: 'info',
        userId: quotation.inquiry.customer._id,
        relatedEntity: {
          type: 'quotation',
          entityId: quotation._id
        },
        metadata: {
          quotationNumber: quotation.quotationNumber,
          inquiryNumber: quotation.inquiry.inquiryNumber,
          totalAmount: quotation.totalAmount,
          currency: quotation.currency
        }
      });
      
      console.log(`Created quotation notification for customer: ${quotation.inquiry.customer.email}`);
    } catch (notificationError) {
      console.error('Failed to create customer notification:', notificationError);
      // Don't fail the operation if notification creation fails
    }

    // Update quotation status
    quotation.status = 'sent';
    quotation.sentAt = new Date();
    await quotation.save();

    console.log('Quotation status updated to sent:', quotation.quotationNumber);

    res.json({
      success: true,
      message: 'Quotation sent successfully to customer via email and SMS',
      quotation: {
        id: quotation._id,
        quotationNumber: quotation.quotationNumber,
        status: quotation.status,
        sentAt: quotation.sentAt,
        customerEmail: quotation.inquiry.customer.email,
        customerPhone: quotation.inquiry.customer.phoneNumber
      }
    });

  } catch (error) {
    console.error('Send quotation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
});

// Customer accepts quotation
router.post('/:id/accept', authenticateToken, async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id)
      .populate('inquiry', 'customer files parts deliveryAddress specialInstructions');

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found',
        quotationId: req.params.id
      });
    }

    if (quotation.status !== 'sent') {
      return res.status(400).json({
        success: false,
        message: 'Quotation cannot be accepted in current status'
      });
    }

    // Check if quotation is still valid
    if (new Date() > quotation.validUntil) {
      return res.status(400).json({
        success: false,
        message: 'Quotation has expired'
      });
    }

    // Update quotation status to accepted
    quotation.status = 'accepted';
    quotation.acceptedAt = new Date();
    await quotation.save();

    // Create order automatically when quotation is accepted
    const Order = require('../models/Order');
    
    // Check if order already exists for this quotation
    const existingOrder = await Order.findOne({ quotation: req.params.id });
    
    if (!existingOrder) {
      // Ensure deliveryAddress is always a valid object
      let deliveryAddress = {
        street: '',
        city: '',
        state: '',
        country: '',
        zipCode: ''
      };
      
      if (quotation.inquiry && quotation.inquiry.deliveryAddress) {
        deliveryAddress = {
          street: quotation.inquiry.deliveryAddress.street || '',
          city: quotation.inquiry.deliveryAddress.city || '',
          state: quotation.inquiry.deliveryAddress.state || '',
          country: quotation.inquiry.deliveryAddress.country || '',
          zipCode: quotation.inquiry.deliveryAddress.zipCode || ''
        };
      }

      const order = new Order({
        quotation: req.params.id,
        customer: req.userId,
        inquiry: quotation.inquiry._id,
        orderNumber: `ORD${Date.now()}`,
        parts: quotation.parts,
        totalAmount: quotation.totalAmount,
        currency: quotation.currency || 'USD',
        status: 'pending',
        payment: {
          method: 'pending',
          status: 'pending',
          transactionId: null,
          paidAt: null
        },
        deliveryAddress: deliveryAddress
      });

      await order.save();
      console.log('Order created automatically for accepted quotation:', order.orderNumber);
    }

    res.json({
      success: true,
      message: 'Quotation accepted successfully. Order has been created.',
      quotation: {
        id: quotation._id,
        quotationNumber: quotation.quotationNumber,
        totalAmount: quotation.totalAmount,
        status: quotation.status
      }
    });

  } catch (error) {
    console.error('Accept quotation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Customer rejects quotation
router.post('/:id/reject', authenticateToken, async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found'
      });
    }

    if (quotation.status !== 'sent') {
      return res.status(400).json({
        success: false,
        message: 'Quotation cannot be rejected in current status'
      });
    }

    quotation.status = 'rejected';
    quotation.rejectedAt = new Date();
    await quotation.save();

    res.json({
      success: true,
      message: 'Quotation rejected successfully'
    });

  } catch (error) {
    console.error('Reject quotation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Delete quotation (Back Office with permission check)
router.delete('/:id', authenticateToken, requireQuotationPermission, async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found'
      });
    }

    if (quotation.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Only draft quotations can be deleted'
      });
    }

    await Quotation.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Quotation deleted successfully'
    });

  } catch (error) {
    console.error('Delete quotation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
