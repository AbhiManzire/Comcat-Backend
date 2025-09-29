const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Order = require('../models/Order');
const Inquiry = require('../models/Inquiry');
const Quotation = require('../models/Quotation');
const { authenticateToken, requireAdmin, requireBackOffice } = require('../middleware/auth');
const router = express.Router();

// Get dashboard statistics (Admin/Back Office)
router.get('/dashboard/stats', authenticateToken, requireBackOffice, async (req, res) => {
  try {
    // Get counts in parallel for better performance
    const [
      totalInquiries,
      totalQuotations,
      activeOrders,
      completedOrders
    ] = await Promise.all([
      Inquiry.countDocuments(),
      Quotation.countDocuments(),
      Order.countDocuments({ 
        status: { $in: ['confirmed', 'in_production', 'ready_for_dispatch', 'dispatched'] } 
      }),
      Order.countDocuments({ status: 'delivered' })
    ]);

    res.json({
      success: true,
      stats: {
        inquiries: totalInquiries,
        quotations: totalQuotations,
        orders: activeOrders,
        completed: completedOrders
      }
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get all orders (Admin/Back Office)
router.get('/orders', authenticateToken, requireBackOffice, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('customer', 'firstName lastName email companyName')
      .populate('quotation', 'quotationNumber')
      .populate('inquiry', 'inquiryNumber')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      orders
    });

  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update order status (Admin/Back Office)
router.put('/orders/:id/status', authenticateToken, requireBackOffice, [
  body('status').isIn(['pending', 'confirmed', 'in_production', 'ready_for_dispatch', 'dispatched', 'delivered', 'cancelled']).withMessage('Invalid status'),
  body('notes').optional().isString(),
  body('estimatedDelivery').optional().isISO8601().withMessage('Valid delivery date is required'),
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

    const { status, notes, estimatedDelivery } = req.body;
    const orderId = req.params.id;

    const order = await Order.findById(orderId)
      .populate('customer', 'firstName lastName email phoneNumber');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const oldStatus = order.status;
    order.status = status;
    order.updatedAt = new Date();

    // Update payment status based on order status
    if (!order.payment) {
      order.payment = {};
    }
    
    // Set payment status based on order status
    if (status === 'delivered' || status === 'dispatched' || status === 'ready_for_dispatch' || status === 'in_production' || status === 'confirmed') {
      order.payment.status = 'completed';
      if (!order.payment.paidAt) {
        order.payment.paidAt = new Date();
      }
      if (!order.payment.method || order.payment.method === 'pending') {
        order.payment.method = 'bank_transfer';
      }
    } else if (status === 'cancelled') {
      order.payment.status = 'refunded';
    }

    // Set specific timestamps based on status
    if (status === 'confirmed' && !order.confirmedAt) {
      order.confirmedAt = new Date();
    } else if (status === 'in_production' && !order.production.startDate) {
      order.production.startDate = new Date();
      // Set estimated delivery time if provided
      if (estimatedDelivery) {
        order.production.estimatedCompletion = new Date(estimatedDelivery);
      }
    } else if (status === 'ready_for_dispatch') {
      order.production.actualCompletion = new Date();
    } else if (status === 'dispatched') {
      order.dispatch.dispatchedAt = new Date();
    } else if (status === 'delivered') {
      order.dispatch.actualDelivery = new Date();
    }

    if (notes) {
      order.notes = notes;
    }

    await order.save();

    res.json({
      success: true,
      message: 'Order status updated successfully',
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        updatedAt: order.updatedAt
      }
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update delivery details (Admin/Back Office)
router.put('/orders/:id/delivery', authenticateToken, requireBackOffice, [
  body('courier').notEmpty().withMessage('Courier name is required'),
  body('trackingNumber').notEmpty().withMessage('Tracking number is required'),
  body('estimatedDelivery').optional().isISO8601().withMessage('Valid delivery date is required'),
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

    const { courier, trackingNumber, estimatedDelivery, notes } = req.body;
    const orderId = req.params.id;

    const order = await Order.findById(orderId)
      .populate('customer', 'firstName lastName email phoneNumber');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Update dispatch details
    order.dispatch.courier = courier;
    order.dispatch.trackingNumber = trackingNumber;
    order.dispatch.dispatchedAt = new Date();
    order.status = 'dispatched';
    
    if (estimatedDelivery) {
      order.dispatch.estimatedDelivery = new Date(estimatedDelivery);
    }
    
    if (notes) {
      order.dispatch.notes = notes;
    }

    order.updatedAt = new Date();
    await order.save();

    res.json({
      success: true,
      message: 'Delivery details updated successfully',
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        dispatch: order.dispatch
      }
    });

  } catch (error) {
    console.error('Update delivery details error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get all users (Admin only)
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}, '-password')
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Create sub-admin
router.post('/subadmin', authenticateToken, requireAdmin, [
  body('email').isEmail().normalizeEmail(),
  body('firstName').trim().isLength({ min: 1 }),
  body('lastName').trim().isLength({ min: 1 }),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/),
  body('permissions.canCreateQuotations').optional().isBoolean(),
  body('permissions.canManageUsers').optional().isBoolean(),
  body('permissions.canViewAllInquiries').optional().isBoolean(),
  body('permissions.canManageOrders').optional().isBoolean()
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

    const { 
      email, 
      firstName, 
      lastName, 
      password,
      permissions = {}
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create sub-admin user
    const user = new User({
      email,
      firstName,
      lastName,
      phoneNumber: '0000000000', // Default phone number
      companyName: 'Sub-Admin Company', // Default company name
      department: 'Engineering', // Default department
      country: 'India', // Default country
      address: {
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'India'
      },
      password,
      role: 'subadmin',
      permissions: {
        canCreateQuotations: permissions.canCreateQuotations || false,
        canManageUsers: permissions.canManageUsers || false,
        canViewAllInquiries: permissions.canViewAllInquiries || false,
        canManageOrders: permissions.canManageOrders || false
      },
      createdBy: req.userId
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: 'Sub-admin created successfully',
      user: user.getProfile()
    });

  } catch (error) {
    console.error('Create sub-admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update sub-admin permissions
router.put('/subadmin/:id/permissions', authenticateToken, requireAdmin, [
  body('permissions.canCreateQuotations').optional().isBoolean(),
  body('permissions.canManageUsers').optional().isBoolean(),
  body('permissions.canViewAllInquiries').optional().isBoolean(),
  body('permissions.canManageOrders').optional().isBoolean()
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

    const { permissions } = req.body;
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role !== 'subadmin') {
      return res.status(400).json({
        success: false,
        message: 'User is not a sub-admin'
      });
    }

    // Update permissions
    if (permissions.canCreateQuotations !== undefined) {
      user.permissions.canCreateQuotations = permissions.canCreateQuotations;
    }
    if (permissions.canManageUsers !== undefined) {
      user.permissions.canManageUsers = permissions.canManageUsers;
    }
    if (permissions.canViewAllInquiries !== undefined) {
      user.permissions.canViewAllInquiries = permissions.canViewAllInquiries;
    }
    if (permissions.canManageOrders !== undefined) {
      user.permissions.canManageOrders = permissions.canManageOrders;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Sub-admin permissions updated successfully',
      user: user.getProfile()
    });

  } catch (error) {
    console.error('Update permissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Deactivate/Activate sub-admin
router.put('/subadmin/:id/status', authenticateToken, requireAdmin, [
  body('isActive').isBoolean()
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

    const { isActive } = req.body;
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role !== 'subadmin') {
      return res.status(400).json({
        success: false,
        message: 'User is not a sub-admin'
      });
    }

    user.isActive = isActive;
    await user.save();

    res.json({
      success: true,
      message: `Sub-admin ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: user.getProfile()
    });

  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Delete sub-admin
router.delete('/subadmin/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role !== 'subadmin') {
      return res.status(400).json({
        success: false,
        message: 'User is not a sub-admin'
      });
    }

    await User.findByIdAndDelete(userId);

    res.json({
      success: true,
      message: 'Sub-admin deleted successfully'
    });

  } catch (error) {
    console.error('Delete sub-admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Change user role (for development/testing purposes)
router.post('/change-role', async (req, res) => {
  try {
    const { email, newRole } = req.body;
    
    if (!email || !newRole) {
      return res.status(400).json({
        success: false,
        message: 'Email and new role are required'
      });
    }
    
    // Find user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Change role
    user.role = newRole;
    await user.save();
    
    res.json({
      success: true,
      message: 'User role changed successfully',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('Change role error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
