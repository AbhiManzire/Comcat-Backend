const jwt = require('jsonwebtoken');

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: 'Access token required' 
    });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, decoded) => {
    if (err) {
      return res.status(403).json({ 
        success: false,
        message: 'Invalid token' 
      });
    }
    
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  });
};

// Middleware to check if user is admin/backoffice
const requireAdmin = (req, res, next) => {
  if (!['admin', 'backoffice'].includes(req.userRole)) {
    return res.status(403).json({ 
      success: false,
      message: 'Admin access required' 
    });
  }
  next();
};

// Middleware to check if user is back office/admin/subadmin
const requireBackOffice = (req, res, next) => {
  if (!['admin', 'backoffice', 'subadmin'].includes(req.userRole)) {
    return res.status(403).json({ 
      success: false,
      message: 'Back office access required' 
    });
  }
  next();
};

// Middleware to check quotation creation permission
const requireQuotationPermission = async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Admin and backoffice always have permission
    if (['admin', 'backoffice'].includes(user.role)) {
      return next();
    }

    // Sub-admin needs specific permission
    if (user.role === 'subadmin' && user.permissions.canCreateQuotations) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Insufficient permissions to create quotations'
    });
  } catch (error) {
    console.error('Permission check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requireBackOffice,
  requireQuotationPermission
};
