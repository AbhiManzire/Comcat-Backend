const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { sendQuotationEmail } = require('../services/emailService');
const { sendSMS } = require('../services/smsService');
const Quotation = require('../models/Quotation');
const Inquiry = require('../models/Inquiry');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/quotations');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `quotation-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// @route   POST /api/quotation/create
// @desc    Create a new quotation
// @access  Private (Admin/Back Office)
router.post('/create', [
  authenticateToken,
  body('inquiryId').notEmpty().withMessage('Inquiry ID is required'),
  body('totalAmount').isNumeric().withMessage('Total amount must be a number')
], async (req, res) => {
  try {
    console.log('=== QUOTATION CREATE REQUEST START ===');
    console.log('User ID:', req.userId);
    console.log('User Role:', req.userRole);
    console.log('Request Body:', JSON.stringify(req.body, null, 2));

    console.log('=== STEP 2: VALIDATING REQUEST ===');
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    console.log('=== STEP 3: VALIDATION PASSED ===');

    const { inquiryId, parts, totalAmount, isUploadQuotation, uploadedFile, terms, notes, validUntil } = req.body;
    console.log('=== STEP 4: EXTRACTED REQUEST DATA ===');
    console.log('inquiryId:', inquiryId);
    console.log('parts:', parts);
    console.log('totalAmount:', totalAmount);

    console.log('=== STEP 5: FETCHING INQUIRY ===');
    // Get customer info from inquiry
    const inquiry = await Inquiry.findById(inquiryId).populate('customer', 'firstName lastName email companyName phoneNumber');
    console.log('=== STEP 6: INQUIRY FETCHED ===');
    if (!inquiry) {
      console.log('Inquiry not found:', inquiryId);
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found'
      });
    }

    console.log('Found inquiry:', {
      id: inquiry._id,
      customer: inquiry.customer,
      customerType: typeof inquiry.customer,
      customerKeys: inquiry.customer ? Object.keys(inquiry.customer) : 'No customer object'
    });
    console.log('=== STEP 7: INQUIRY FOUND ===');

    // Check if quotation already exists for this inquiry
    console.log('=== STEP 7.5: CHECKING FOR EXISTING QUOTATION ===');
    const existingQuotation = await Quotation.findOne({ inquiryId: inquiryId.toString() });
    if (existingQuotation) {
      console.log('Quotation already exists for this inquiry:', existingQuotation._id);
      return res.status(400).json({
        success: false,
        message: 'A quotation already exists for this inquiry',
        existingQuotationId: existingQuotation._id,
        quotationNumber: existingQuotation.quotationNumber
      });
    }
    console.log('=== STEP 7.6: NO EXISTING QUOTATION FOUND ===');

    console.log('=== STEP 8: CREATING QUOTATION DATA ===');
    // Create quotation object with proper data structure
    let customerInfo;
    try {
      customerInfo = {
        name: (inquiry.customer?.firstName || '') + ' ' + (inquiry.customer?.lastName || '') || 'Customer',
        company: inquiry.customer?.companyName || 'Company',
        email: inquiry.customer?.email || 'customer@example.com',
        phone: inquiry.customer?.phoneNumber || '+1234567890'
      };
      console.log('Customer info extracted:', customerInfo);
    } catch (customerError) {
      console.error('Error extracting customer info:', customerError);
      customerInfo = {
        name: 'Customer',
        company: 'Company',
        email: 'customer@example.com',
        phone: '+1234567890'
      };
    }
    
    const quotationData = {
      inquiryId: inquiryId.toString(), // Convert ObjectId to string
      customerInfo: customerInfo,
      totalAmount: parseFloat(totalAmount),
      items: Array.isArray(parts) ? parts.map(part => ({
        partRef: part.partRef || '',
        material: part.material || 'Zintec',
        thickness: part.thickness || '1.5',
        grade: part.grade || '',
        quantity: part.quantity || 1,
        unitPrice: part.unitPrice || 0,
        totalPrice: part.totalPrice || 0,
        remark: part.remarks || part.remark || ''
      })) : [],
      quotationPdf: (uploadedFile && typeof uploadedFile === 'object' && Object.keys(uploadedFile).length > 0) ? 'uploaded' : null,
      status: 'draft',
      createdBy: req.userId
    };

    console.log('Quotation data to save:', JSON.stringify(quotationData, null, 2));
    console.log('=== STEP 9: QUOTATION DATA CREATED ===');

    console.log('=== STEP 10: SAVING TO DATABASE ===');
    // Save quotation to database
    let savedQuotation;
    try {
      savedQuotation = await Quotation.create(quotationData);
      console.log('Quotation saved successfully:', savedQuotation._id);
      console.log('=== STEP 11: DATABASE SAVE COMPLETE ===');
    } catch (dbError) {
      console.error('Database save error:', dbError);
      console.error('Error name:', dbError.name);
      console.error('Error message:', dbError.message);
      console.error('Error code:', dbError.code);
      if (dbError.name === 'ValidationError') {
        console.error('Validation errors:', dbError.errors);
      }
      throw dbError; // Re-throw to be caught by outer try-catch
    }

    // Update inquiry status to 'quoted'
    console.log('=== STEP 12: UPDATING INQUIRY STATUS ===');
    try {
      await Inquiry.findByIdAndUpdate(inquiryId, { 
        status: 'quoted',
        quotation: savedQuotation._id 
      });
      console.log('Inquiry status updated to quoted');
    } catch (updateError) {
      console.error('Error updating inquiry status:', updateError);
      // Don't fail the request if inquiry update fails
    }

    // Send email to customer (optional, don't fail if email fails)
    try {
      if (quotationData.customerInfo.email && quotationData.customerInfo.email !== 'customer@example.com') {
        await sendQuotationEmail(savedQuotation);
        console.log('Quotation email sent successfully');
      }
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Don't fail the request if email fails
    }

    // Send SMS to customer (optional, don't fail if SMS fails)
    try {
      if (quotationData.customerInfo.phone && quotationData.customerInfo.phone !== '+1234567890') {
        await sendSMS(
          quotationData.customerInfo.phone,
          `Your quotation for inquiry ${inquiry.inquiryNumber} has been prepared. Total amount: $${totalAmount}. Please check your email for details.`
        );
        console.log('SMS sent successfully');
      }
    } catch (smsError) {
      console.error('SMS sending failed:', smsError);
      // Don't fail the request if SMS fails
    }

    // Create notification for customer
    try {
      const Notification = require('../models/Notification');
      await Notification.createNotification({
        title: 'Quotation Created',
        message: `Your quotation ${savedQuotation.quotationNumber} has been prepared for inquiry ${inquiry.inquiryNumber}. Total amount: $${totalAmount}. Please review and accept.`,
        type: 'info',
        userId: inquiry.customer._id,
        relatedEntity: {
          type: 'quotation',
          entityId: savedQuotation._id
        },
        metadata: {
          quotationNumber: savedQuotation.quotationNumber,
          inquiryNumber: inquiry.inquiryNumber,
          totalAmount: totalAmount,
          createdAt: new Date()
        }
      });
      console.log('Customer notification created for quotation');
    } catch (notificationError) {
      console.error('Failed to create customer notification:', notificationError);
    }

    // Send real-time WebSocket notification to customer
    try {
      const websocketService = require('../services/websocketService');
      websocketService.notifyQuotationCreated(savedQuotation);
      console.log('Real-time quotation notification sent to customer');
    } catch (wsError) {
      console.error('WebSocket notification failed:', wsError);
    }

    res.json({
      success: true,
      message: 'Quotation created and sent successfully',
      quotation: savedQuotation
    });

  } catch (error) {
    console.error('=== QUOTATION CREATION ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    console.error('Full error object:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @route   POST /api/quotation/upload
// @desc    Upload quotation PDF
// @access  Private (Admin/Back Office)
router.post('/upload', [
  authenticateToken,
  upload.single('quotationPdf'),
  body('inquiryId').notEmpty().withMessage('Inquiry ID is required'),
  body('customerInfo').isObject().withMessage('Customer information is required'),
  body('totalAmount').isNumeric().withMessage('Total amount must be a number')
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

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Quotation PDF file is required'
      });
    }

    const { inquiryId, customerInfo, totalAmount } = req.body;
    const quotationPdfPath = req.file.path;

    // Create quotation object
    const quotationData = {
      inquiryId,
      customerInfo: JSON.parse(customerInfo),
      totalAmount: parseFloat(totalAmount),
      quotationPdf: quotationPdfPath,
      status: 'uploaded',
      createdBy: req.user.id
    };

    // Save quotation to database
    const savedQuotation = await Quotation.create(quotationData);

    // Send email to customer
    try {
      await sendQuotationEmail(savedQuotation);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
    }

    // Send SMS to customer
    try {
      await sendSMS(
        quotationData.customerInfo.phone,
        `Your quotation for inquiry ${inquiryId} has been prepared. Total amount: $${totalAmount}. Please check your email for details.`
      );
    } catch (smsError) {
      console.error('SMS sending failed:', smsError);
    }

    res.json({
      success: true,
      message: 'Quotation uploaded and sent successfully',
      quotation: savedQuotation
    });

  } catch (error) {
    console.error('Quotation upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/quotation
// @desc    Get all quotations (Admin/Back Office)
// @access  Private (Admin/Back Office)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    const query = {};
    if (status) {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { 'customerInfo.name': { $regex: search, $options: 'i' } },
        { 'customerInfo.email': { $regex: search, $options: 'i' } },
        { inquiryId: { $regex: search, $options: 'i' } }
      ];
    }

    // Get quotations with pagination
    const quotations = await Quotation.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'firstName lastName email');

    // Manually populate inquiry data for each quotation
    const quotationsWithInquiry = await Promise.all(
      quotations.map(async (quotation) => {
        const quotationObj = quotation.toObject();
        try {
          // Find the inquiry using the inquiryId string
          const inquiry = await Inquiry.findById(quotation.inquiryId).populate('customer', 'firstName lastName email companyName');
          if (inquiry) {
            quotationObj.inquiry = {
              _id: inquiry._id,
              inquiryNumber: inquiry.inquiryNumber,
              customer: inquiry.customer
            };
          }
        } catch (error) {
          console.error('Error fetching inquiry for quotation:', quotation._id, error);
          quotationObj.inquiry = null;
        }
        return quotationObj;
      })
    );

    const total = await Quotation.countDocuments(query);

    console.log('=== GET QUOTATIONS DEBUG ===');
    console.log('Found quotations:', quotationsWithInquiry.length);
    console.log('Sample quotation:', quotationsWithInquiry[0] ? {
      id: quotationsWithInquiry[0]._id,
      inquiryId: quotationsWithInquiry[0].inquiryId,
      inquiry: quotationsWithInquiry[0].inquiry,
      customerInfo: quotationsWithInquiry[0].customerInfo,
      totalAmount: quotationsWithInquiry[0].totalAmount,
      status: quotationsWithInquiry[0].status,
      createdBy: quotationsWithInquiry[0].createdBy
    } : 'No quotations found');

    res.json({
      success: true,
      quotations: quotationsWithInquiry,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });

  } catch (error) {
    console.error('Get quotations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/quotation/:inquiryId
// @desc    Get quotation by inquiry ID
// @access  Private
router.get('/:inquiryId', authenticateToken, async (req, res) => {
  try {
    const { inquiryId } = req.params;

    // Fetch quotation from database
    const quotation = await Quotation.findOne({ inquiryId });

    if (quotation) {
      // Manually populate inquiry data
      const quotationObj = quotation.toObject();
      try {
        // Find the inquiry using the inquiryId string
        const inquiry = await Inquiry.findById(quotation.inquiryId).populate('customer', 'firstName lastName email companyName');
        if (inquiry) {
          quotationObj.inquiry = {
            _id: inquiry._id,
            inquiryNumber: inquiry.inquiryNumber,
            customer: inquiry.customer
          };
        }
      } catch (error) {
        console.error('Error fetching inquiry for quotation:', quotation._id, error);
        quotationObj.inquiry = null;
      }

      res.json({
        success: true,
        quotation: quotationObj
      });
    } else {
      res.json({
        success: false,
        message: 'Quotation not found'
      });
    }

  } catch (error) {
    console.error('Get quotation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/quotation/id/:id
// @desc    Get quotation by quotation ID
// @access  Private
router.get('/id/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Find the quotation by ID
    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found'
      });
    }

    // Manually populate inquiry data
    const quotationObj = quotation.toObject();
    try {
      // Find the inquiry using the inquiryId string
      const inquiry = await Inquiry.findById(quotation.inquiryId).populate('customer', 'firstName lastName email companyName');
      if (inquiry) {
        quotationObj.inquiry = {
          _id: inquiry._id,
          inquiryNumber: inquiry.inquiryNumber,
          customer: inquiry.customer
        };
      }
    } catch (error) {
      console.error('Error fetching inquiry for quotation:', quotation._id, error);
      quotationObj.inquiry = null;
    }

    res.json({
      success: true,
      quotation: quotationObj
    });

  } catch (error) {
    console.error('Get quotation by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/quotation/:id/send
// @desc    Send quotation to customer
// @access  Private (Admin/Back Office)
router.post('/:id/send', authenticateToken, async (req, res) => {
  try {
    console.log('=== SEND QUOTATION REQUEST START ===');
    const { id } = req.params;
    console.log('Quotation ID:', id);

    // Find the quotation
    const quotation = await Quotation.findById(id);
    if (!quotation) {
      console.log('Quotation not found:', id);
      return res.status(404).json({
        success: false,
        message: 'Quotation not found'
      });
    }

    console.log('Found quotation:', {
      id: quotation._id,
      status: quotation.status,
      customerInfo: quotation.customerInfo,
      totalAmount: quotation.totalAmount
    });

    // Update quotation status to 'sent'
    quotation.status = 'sent';
    quotation.sentAt = new Date();
    await quotation.save();
    console.log('Quotation status updated to sent');

    // Send email to customer
    try {
      console.log('Attempting to send email...');
      if (quotation.customerInfo.email && quotation.customerInfo.email !== 'customer@example.com') {
        // Create a simple email notification
        const nodemailer = require('nodemailer');
        
        // Create transporter (basic configuration)
        const transporter = nodemailer.createTransporter({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: process.env.SMTP_PORT || 587,
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });

        const mailOptions = {
          from: process.env.SMTP_FROM || 'noreply@komacut.com',
          to: quotation.customerInfo.email,
          subject: `Quotation ${quotation.quotationNumber} - Komacut`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Your Quotation is Ready!</h2>
              <p>Dear ${quotation.customerInfo.name},</p>
              <p>Your quotation ${quotation.quotationNumber} has been prepared.</p>
              <p><strong>Total Amount:</strong> $${quotation.totalAmount}</p>
              <p>Please log in to your account to view the full quotation details.</p>
              <p>Thank you for choosing Komacut!</p>
            </div>
          `
        };

        await transporter.sendMail(mailOptions);
        console.log('Quotation email sent successfully');
      } else {
        console.log('No valid customer email for notification');
      }
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Don't fail the request if email fails
    }

    // Send SMS to customer
    try {
      console.log('Attempting to send SMS...');
      console.log('Customer phone:', quotation.customerInfo.phone);
      if (quotation.customerInfo.phone) {
        const smsResult = await sendSMS(
          quotation.customerInfo.phone,
          `Your quotation ${quotation.quotationNumber} has been sent. Total amount: $${quotation.totalAmount}. Please check your email for details.`
        );
        console.log('SMS result:', smsResult);
      } else {
        console.log('No customer phone number available for SMS');
      }
    } catch (smsError) {
      console.error('SMS sending failed:', smsError);
      // Don't fail the request if SMS fails
    }

    console.log('=== SEND QUOTATION COMPLETE ===');
    res.json({
      success: true,
      message: 'Quotation sent successfully',
      quotation: quotation
    });

  } catch (error) {
    console.error('Send quotation error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/quotation/customer
// @desc    Get quotations for the current customer
// @access  Private (Customer)
router.get('/customer', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;
    
    // Get customer's inquiries
    const customerInquiries = await Inquiry.find({ customer: userId }).select('_id');
    const inquiryIds = customerInquiries.map(inquiry => inquiry._id.toString());
    
    // Build query
    const query = { inquiryId: { $in: inquiryIds } };
    if (status) {
      query.status = status;
    }

    // Get quotations with pagination
    const quotations = await Quotation.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Quotation.countDocuments(query);

    console.log('=== GET CUSTOMER QUOTATIONS ===');
    console.log('Customer ID:', userId);
    console.log('Customer inquiries found:', customerInquiries.length);
    console.log('Inquiry IDs:', inquiryIds);
    console.log('Query:', query);
    console.log('Found quotations:', quotations.length);
    console.log('Quotations:', quotations.map(q => ({ id: q._id, status: q.status, inquiryId: q.inquiryId })));

    res.json({
      success: true,
      quotations,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });

  } catch (error) {
    console.error('Get customer quotations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/quotation/customer/:id
// @desc    Get single quotation for customer
// @access  Private (Customer)
router.get('/customer/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // Find the quotation
    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found'
      });
    }

    // Verify this quotation belongs to the customer
    const inquiry = await Inquiry.findById(quotation.inquiryId);
    if (!inquiry || inquiry.customer.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This quotation does not belong to you.'
      });
    }

    // Manually populate inquiry data
    const quotationObj = quotation.toObject();
    try {
      const populatedInquiry = await Inquiry.findById(quotation.inquiryId).populate('customer', 'firstName lastName email companyName');
      if (populatedInquiry) {
        quotationObj.inquiry = {
          _id: populatedInquiry._id,
          inquiryNumber: populatedInquiry.inquiryNumber,
          customer: populatedInquiry.customer
        };
      }
    } catch (error) {
      console.error('Error fetching inquiry for quotation:', quotation._id, error);
      quotationObj.inquiry = null;
    }

    res.json({
      success: true,
      quotation: quotationObj
    });

  } catch (error) {
    console.error('Get customer quotation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/quotation/:id/response
// @desc    Customer response to quotation (accept/reject)
// @access  Private (Customer)
router.post('/:id/response', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { response, notes } = req.body;
    const userId = req.userId;

    console.log('=== QUOTATION RESPONSE REQUEST ===');
    console.log('Quotation ID:', id);
    console.log('User ID:', userId);
    console.log('Response:', response);

    // Find the quotation
    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found'
      });
    }

    // Verify this quotation belongs to the customer
    const inquiry = await Inquiry.findById(quotation.inquiryId);
    if (!inquiry || inquiry.customer.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This quotation does not belong to you.'
      });
    }

    // Update quotation status based on response
    if (response === 'accepted') {
      quotation.status = 'accepted';
      quotation.acceptedAt = new Date();
    } else if (response === 'rejected') {
      quotation.status = 'rejected';
      quotation.rejectedAt = new Date();
      quotation.rejectionReason = notes || 'No reason provided';
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid response. Must be "accepted" or "rejected"'
      });
    }

    await quotation.save();

    // Update inquiry status
    if (response === 'accepted') {
      inquiry.status = 'accepted';
    } else if (response === 'rejected') {
      inquiry.status = 'rejected';
    }
    await inquiry.save();

    console.log('Quotation response processed successfully');

    res.json({
      success: true,
      message: `Quotation ${response} successfully`,
      quotation: quotation
    });

  } catch (error) {
    console.error('Quotation response error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/quotation/:id/pdf
// @desc    Get quotation PDF
// @access  Private
router.get('/:id/pdf', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // Find the quotation
    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found'
      });
    }

    // Check if quotation has a PDF
    if (!quotation.quotationPdf) {
      return res.status(404).json({
        success: false,
        message: 'Quotation PDF not available'
      });
    }

    // For now, return a message that PDF is not implemented
    // TODO: Implement actual PDF generation/retrieval
    res.json({
      success: false,
      message: 'PDF generation not implemented yet'
    });

  } catch (error) {
    console.error('Get quotation PDF error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;