const express = require('express');
const { body, validationResult } = require('express-validator');
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const { sendDispatchNotification } = require('../services/emailService');

// Import middleware from auth.js
const { authenticateToken, requireBackOffice } = require('../middleware/auth');

const router = express.Router();

// Get orders ready for dispatch
router.get('/ready', authenticateToken, requireBackOffice, async (req, res) => {
  try {
    const orders = await Order.find({
      status: 'ready_for_dispatch'
    })
    .populate('customer', 'firstName lastName companyName email')
    .populate('inquiry', 'inquiryNumber')
    .sort({ updatedAt: -1 });

    res.json({
      success: true,
      orders
    });

  } catch (error) {
    console.error('Get ready orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Dispatch order
router.post('/:orderId', authenticateToken, requireBackOffice, [
  body('trackingNumber').notEmpty(),
  body('courier').notEmpty(),
  body('estimatedDelivery').isISO8601(),
  body('deliveryNotes').optional().isString()
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

    const { trackingNumber, courier, estimatedDelivery, deliveryNotes } = req.body;
    const order = await Order.findById(req.params.orderId)
      .populate('customer', 'firstName lastName email phoneNumber');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status !== 'ready_for_dispatch') {
      return res.status(400).json({
        success: false,
        message: 'Order is not ready for dispatch'
      });
    }

    // Update order with dispatch details
    order.status = 'dispatched';
    order.dispatch = {
      trackingNumber,
      courier,
      dispatchedAt: new Date(),
      estimatedDelivery: new Date(estimatedDelivery),
      deliveryNotes: deliveryNotes || ''
    };

    order.updatedAt = new Date();
    await order.save();

    // Send dispatch notification email to customer
    try {
      await sendDispatchNotification(order);
      console.log('Dispatch notification email sent to customer:', order.customer.email);
    } catch (emailError) {
      console.error('Dispatch notification email failed:', emailError);
    }

    // Create notification for customer
    try {
await Notification.createNotification({
  title: 'Order Dispatched',
  message: `Your order ${order.orderNumber} has been dispatched! Tracking Number: ${trackingNumber}, Courier: ${courier}. Estimated delivery: ${new Date(estimatedDelivery).toLocaleDateString()}.`,
  type: 'success',
  userId: order.customer._id,
  relatedEntity: {
    type: 'order',
    entityId: order._id
  },
  metadata: {
    orderNumber: order.orderNumber,
    trackingNumber: trackingNumber,
    courier: courier,
    estimatedDelivery: estimatedDelivery,
    dispatchedAt: new Date()
  }
});
      
      console.log(`Created dispatch notification for customer: ${order.customer.email}`);
    } catch (notificationError) {
      console.error('Failed to create dispatch notification:', notificationError);
      // Don't fail the operation if notification creation fails
    }

    res.json({
      success: true,
      message: 'Order dispatched successfully',
      dispatch: {
        orderNumber: order.orderNumber,
        trackingNumber: order.dispatch.trackingNumber,
        courier: order.dispatch.courier,
        dispatchedAt: order.dispatch.dispatchedAt,
        estimatedDelivery: order.dispatch.estimatedDelivery
      }
    });

  } catch (error) {
    console.error('Dispatch order error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update dispatch details
router.put('/:orderId', authenticateToken, requireBackOffice, [
  body('trackingNumber').optional().notEmpty(),
  body('courier').optional().notEmpty(),
  body('estimatedDelivery').optional().isISO8601(),
  body('deliveryNotes').optional().isString()
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

    const { trackingNumber, courier, estimatedDelivery, deliveryNotes } = req.body;
    const order = await Order.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (!['dispatched', 'delivered'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Order is not dispatched'
      });
    }

    // Update dispatch details
    if (trackingNumber) order.dispatch.trackingNumber = trackingNumber;
    if (courier) order.dispatch.courier = courier;
    if (estimatedDelivery) order.dispatch.estimatedDelivery = new Date(estimatedDelivery);
    if (deliveryNotes) order.dispatch.deliveryNotes = deliveryNotes;

    order.updatedAt = new Date();
    await order.save();

    res.json({
      success: true,
      message: 'Dispatch details updated successfully',
      dispatch: order.dispatch
    });

  } catch (error) {
    console.error('Update dispatch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Mark order as delivered
router.post('/:orderId/delivered', authenticateToken, requireBackOffice, [
  body('actualDelivery').isISO8601(),
  body('deliveryNotes').optional().isString()
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

    const { actualDelivery, deliveryNotes } = req.body;
    const order = await Order.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status !== 'dispatched') {
      return res.status(400).json({
        success: false,
        message: 'Order is not dispatched'
      });
    }

    // Mark order as delivered
    order.status = 'delivered';
    order.dispatch.actualDelivery = new Date(actualDelivery);
    if (deliveryNotes) {
      order.dispatch.deliveryNotes = deliveryNotes;
    }

    order.updatedAt = new Date();
    await order.save();

    res.json({
      success: true,
      message: 'Order marked as delivered successfully',
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        deliveredAt: order.dispatch.actualDelivery
      }
    });

  } catch (error) {
    console.error('Mark delivered error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get dispatch tracking information (customer access)
router.get('/:orderId/tracking', async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .select('orderNumber status dispatch createdAt updatedAt');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (!['dispatched', 'delivered'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Order is not dispatched yet'
      });
    }

    const trackingInfo = {
      orderNumber: order.orderNumber,
      status: order.status,
      dispatch: {
        trackingNumber: order.dispatch.trackingNumber,
        courier: order.dispatch.courier,
        dispatchedAt: order.dispatch.dispatchedAt,
        estimatedDelivery: order.dispatch.estimatedDelivery,
        actualDelivery: order.dispatch.actualDelivery,
        deliveryNotes: order.dispatch.deliveryNotes
      }
    };

    res.json({
      success: true,
      tracking: trackingInfo
    });

  } catch (error) {
    console.error('Get tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get all dispatched orders (back office)
router.get('/', authenticateToken, requireBackOffice, async (req, res) => {
  try {
    const { status, courier, page = 1, limit = 10 } = req.query;
    
    let query = { status: { $in: ['dispatched', 'delivered'] } };
    
    if (status) {
      query.status = status;
    }
    
    if (courier) {
      query['dispatch.courier'] = { $regex: courier, $options: 'i' };
    }

    const skip = (page - 1) * limit;
    
    const orders = await Order.find(query)
      .populate('customer', 'firstName lastName companyName')
      .populate('inquiry', 'inquiryNumber')
      .sort({ 'dispatch.dispatchedAt': -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalOrders: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get dispatched orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get dispatch statistics (back office)
router.get('/stats/overview', authenticateToken, requireBackOffice, async (req, res) => {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    const stats = await Order.aggregate([
      {
        $match: {
          status: { $in: ['dispatched', 'delivered'] }
        }
      },
      {
        $group: {
          _id: null,
          totalDispatched: { $sum: 1 },
          totalDelivered: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          },
          totalInTransit: {
            $sum: { $cond: [{ $eq: ['$status', 'dispatched'] }, 1, 0] }
          }
        }
      }
    ]);

    const monthlyStats = await Order.aggregate([
      {
        $match: {
          'dispatch.dispatchedAt': { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$dispatch.dispatchedAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const courierStats = await Order.aggregate([
      {
        $match: {
          status: { $in: ['dispatched', 'delivered'] }
        }
      },
      {
        $group: {
          _id: '$dispatch.courier',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      stats: {
        overview: stats[0] || {
          totalDispatched: 0,
          totalDelivered: 0,
          totalInTransit: 0
        },
        monthly: monthlyStats,
        couriers: courierStats
      }
    });

  } catch (error) {
    console.error('Get dispatch stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
