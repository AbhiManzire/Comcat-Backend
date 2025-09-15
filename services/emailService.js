const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
  // Check if SMTP configuration is available
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('SMTP configuration missing. Email service will be disabled.');
    return null;
  }
  
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// Import SMS service
const { 
  sendInquiryNotificationSMS,
  sendQuotationNotificationSMS,
  sendOrderConfirmationSMS,
  sendDispatchNotificationSMS,
  sendPaymentConfirmationSMS
} = require('./smsService');

// Legacy SMS function for backward compatibility
const sendSMS = async (phoneNumber, message) => {
  try {
    // Use the new SMS service
    const result = await sendInquiryNotificationSMS({ inquiryNumber: 'LEGACY' }, { firstName: 'User', lastName: 'User' });
    console.log(`SMS to ${phoneNumber}: ${message}`);
    return true;
  } catch (error) {
    console.error('SMS sending failed:', error);
    return false;
  }
};

// Send welcome email to new customers
const sendWelcomeEmail = async (email, firstName) => {
  try {
    const transporter = createTransporter();
    
    // If no transporter (SMTP not configured), just log and return
    if (!transporter) {
      console.log('SMTP not configured. Welcome email skipped for:', email);
      return;
    }
    
    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@komacut.com',
      to: email,
      subject: 'Welcome to Komacut - Your Sheet Metal Manufacturing Partner',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">KOMACUT</h1>
            <p style="margin: 5px 0;">SHEET METAL PARTS ON DEMAND</p>
          </div>
          
          <div style="padding: 20px;">
            <h2>Welcome ${firstName}!</h2>
            <p>Thank you for creating your account with Komacut. We're excited to have you as part of our manufacturing community.</p>
            
            <h3>What's Next?</h3>
            <ul>
              <li>Upload your technical drawings (DWG, DXF, ZIP)</li>
              <li>Specify material requirements and quantities</li>
              <li>Receive competitive quotes</li>
              <li>Place orders with confidence</li>
            </ul>
            
            <h3>Our Expertise:</h3>
            <ul>
              <li>Laser Cutting</li>
              <li>Surface Finishing</li>
              <li>Threading & Chamfering</li>
              <li>Sheet Metal Bending</li>
              <li>Laser Engraving</li>
              <li>CNC Turning</li>
            </ul>
            
            <p>If you have any questions, feel free to reach out to our support team.</p>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}" 
                 style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
                Get Started
              </a>
            </div>
          </div>
          
          <div style="background-color: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666;">
            <p>© 2024 Komacut. All rights reserved.</p>
            <p>Delivering Factory Direct Quality Sheet Metal Parts Since 2005</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Welcome email sent successfully to:', email);
    
  } catch (error) {
    console.error('Welcome email failed:', error);
    // Don't throw error, just log it to prevent signup from failing
  }
};

// Send inquiry notification to back office
const sendInquiryNotification = async (inquiry) => {
  try {
    const transporter = createTransporter();
    
    // If no transporter (SMTP not configured), just log and return
    if (!transporter) {
      console.log('SMTP not configured. Inquiry notification skipped.');
      return;
    }

    // Get customer information - handle both populated and unpopulated cases
    let customerInfo = {};
    if (inquiry.customer && typeof inquiry.customer === 'object') {
      if (inquiry.customer.firstName) {
        // Customer is populated
        customerInfo = {
          firstName: inquiry.customer.firstName,
          lastName: inquiry.customer.lastName || '',
          companyName: inquiry.customer.companyName || 'N/A',
          email: inquiry.customer.email || 'N/A',
          phoneNumber: inquiry.customer.phoneNumber || 'N/A'
        };
      } else {
        // Customer is an ObjectId, we need to fetch it
        try {
          const User = require('../models/User');
          const customer = await User.findById(inquiry.customer);
          if (customer) {
            customerInfo = {
              firstName: customer.firstName || 'Unknown',
              lastName: customer.lastName || '',
              companyName: customer.companyName || 'N/A',
              email: customer.email || 'N/A',
              phoneNumber: customer.phoneNumber || 'N/A'
            };
          }
        } catch (fetchError) {
          console.error('Failed to fetch customer data:', fetchError);
          customerInfo = {
            firstName: 'Unknown',
            lastName: '',
            companyName: 'N/A',
            email: 'N/A',
            phoneNumber: 'N/A'
          };
        }
      }
    }
    
    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@komacut.com',
      to: process.env.BACKOFFICE_EMAIL || 'backoffice@komacut.com',
      subject: `New Inquiry Received - ${inquiry.inquiryNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #FF9800; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">New Inquiry Received</h1>
            <p style="margin: 5px 0;">Inquiry Number: ${inquiry.inquiryNumber}</p>
          </div>
          
          <div style="padding: 20px;">
            <h3>Customer Information:</h3>
            <p><strong>Name:</strong> ${customerInfo.firstName} ${customerInfo.lastName}</p>
            <p><strong>Company:</strong> ${customerInfo.companyName}</p>
            <p><strong>Email:</strong> ${customerInfo.email}</p>
            <p><strong>Phone:</strong> ${customerInfo.phoneNumber}</p>
            
            <h3>Inquiry Details:</h3>
            <p><strong>Files Attached:</strong> ${inquiry.files.length}</p>
            <p><strong>Parts:</strong> ${inquiry.parts.length}</p>
            <p><strong>Total Amount:</strong> $${inquiry.totalAmount || 0}</p>
            
            <h3>Parts Specifications:</h3>
            <ul>
              ${inquiry.parts.map(part => `
                <li>${part.partRef || 'Part'}: ${part.material} - ${part.thickness}mm (Qty: ${part.quantity})
                  ${part.remarks ? `<br><em>Remarks: ${part.remarks}</em>` : ''}
                </li>
              `).join('')}
            </ul>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/backoffice" 
                 style="background-color: #FF9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
                Review Inquiry
              </a>
            </div>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Inquiry notification email sent successfully');
    
    // Send SMS notification to back office
    try {
      const smsResult = await sendInquiryNotificationSMS(inquiry, customerInfo);
      if (smsResult.success) {
        console.log('Inquiry SMS notification sent successfully');
      } else {
        console.log('Inquiry SMS notification failed:', smsResult.message);
      }
    } catch (smsError) {
      console.error('SMS notification failed:', smsError);
      // Don't fail the email if SMS fails
    }
    
  } catch (error) {
    console.error('Inquiry notification failed:', error);
    // Don't throw error, just log it to prevent inquiry creation from failing
  }
};

// Send quotation email to customer
const sendQuotationEmail = async (quotation) => {
  try {
    const transporter = createTransporter();
    
    // Get customer information
    let customerInfo = {};
    if (quotation.inquiry && quotation.inquiry.customer) {
      if (typeof quotation.inquiry.customer === 'object' && quotation.inquiry.customer.firstName) {
        customerInfo = quotation.inquiry.customer;
      } else {
        // Customer is an ObjectId, we need to fetch it
        try {
          const User = require('../models/User');
          const customer = await User.findById(quotation.inquiry.customer);
          if (customer) {
            customerInfo = customer;
          }
        } catch (fetchError) {
          console.error('Failed to fetch customer data:', fetchError);
        }
      }
    }
    
    if (!customerInfo.email) {
      console.error('No customer email found for quotation:', quotation._id);
      return;
    }
    
    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@komacut.com',
      to: customerInfo.email,
      subject: `Quotation ${quotation.quotationNumber} - Inquiry ${quotation.inquiry.inquiryNumber} - Komacut`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Quotation Ready</h1>
            <p style="margin: 5px 0;">Quotation Number: ${quotation.quotationNumber}</p>
          </div>
          
          <div style="padding: 20px;">
            <h3>Dear ${customerInfo.firstName || 'Valued Customer'},</h3>
            <p>Thank you for your inquiry. We have prepared a competitive quotation for your sheet metal parts.</p>
            
            <h3>Quotation Summary:</h3>
            <p><strong>Quotation Number:</strong> ${quotation.quotationNumber}</p>
            <p><strong>Inquiry Number:</strong> ${quotation.inquiry.inquiryNumber}</p>
            <p><strong>Total Amount:</strong> ${quotation.currency} ${quotation.totalAmount}</p>
            <p><strong>Valid Until:</strong> ${new Date(quotation.validUntil).toLocaleDateString()}</p>
            
            <h3>Parts & Pricing:</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <thead>
                <tr style="background-color: #f5f5f5;">
                  <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Part</th>
                  <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Material</th>
                  <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Thickness</th>
                  <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Qty</th>
                  <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Unit Price</th>
                  <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${quotation.parts.map(part => `
                  <tr>
                    <td style="border: 1px solid #ddd; padding: 8px;">${part.partRef || 'Part'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${part.material}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${part.thickness}mm</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${part.quantity}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">$${part.unitPrice}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">$${part.totalPrice}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <h3>Terms & Conditions:</h3>
            <p style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #4CAF50;">
              ${quotation.terms}
            </p>
            
            ${quotation.notes ? `
            <h3>Additional Notes:</h3>
            <p style="background-color: #f0f8ff; padding: 15px; border-left: 4px solid #2196F3;">
              ${quotation.notes}
            </p>
            ` : ''}
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/quotations/${quotation._id}" 
                 style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-right: 10px;">
                 View Quotation
              </a>
              <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/quotations/${quotation._id}/accept" 
                 style="background-color: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
                 Accept Quotation
              </a>
            </div>
            
            <p style="margin-top: 30px;">If you have any questions, please don't hesitate to contact us.</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Quotation email sent successfully to:', customerInfo.email);
    
    // Send SMS notification to customer
    try {
      const smsResult = await sendQuotationNotificationSMS(quotation, customerInfo);
      if (smsResult.success) {
        console.log('Quotation SMS notification sent successfully');
      } else {
        console.log('Quotation SMS notification failed:', smsResult.message);
      }
    } catch (smsError) {
      console.error('SMS notification failed:', smsError);
      // Don't fail the email if SMS fails
    }
    
  } catch (error) {
    console.error('Quotation email failed:', error);
    throw error;
  }
};

// Send order confirmation
const sendOrderConfirmation = async (order) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@komacut.com',
      to: order.customer.email,
      subject: `Order Confirmed - ${order.orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Order Confirmed</h1>
            <p style="margin: 5px 0;">Order Number: ${order.orderNumber}</p>
          </div>
          
          <div style="padding: 20px;">
            <h3>Dear ${order.customer.firstName},</h3>
            <p>Your order has been confirmed and is now in production!</p>
            
            <h3>Order Details:</h3>
            <p><strong>Order Number:</strong> ${order.orderNumber}</p>
            <p><strong>Total Amount:</strong> ${order.currency} ${order.totalAmount}</p>
            <p><strong>Payment Status:</strong> ${order.payment ? order.payment.status : 'Completed'}</p>
            
            <h3>Production Timeline:</h3>
            <p><strong>Start Date:</strong> ${order.production && order.production.startDate ? new Date(order.production.startDate).toLocaleDateString() : 'TBD'}</p>
            <p><strong>Estimated Completion:</strong> ${order.production && order.production.estimatedCompletion ? new Date(order.production.estimatedCompletion).toLocaleDateString() : 'TBD'}</p>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/orders/${order._id}/tracking" 
                 style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
                Track Order
              </a>
            </div>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Order confirmation email sent successfully');
    
    // Send SMS notification
    try {
      const smsResult = await sendOrderConfirmationSMS(order, order.customer);
      if (smsResult.success) {
        console.log('Order confirmation SMS notification sent successfully');
      } else {
        console.log('Order confirmation SMS notification failed:', smsResult.message);
      }
    } catch (smsError) {
      console.error('SMS notification failed:', smsError);
      // Don't fail the email if SMS fails
    }
    
  } catch (error) {
    console.error('Order confirmation email failed:', error);
    throw error;
  }
};

// Send dispatch notification
const sendDispatchNotification = async (order) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@komacut.com',
      to: order.customer.email,
      subject: `Order Dispatched - ${order.orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #2196F3; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Order Dispatched</h1>
            <p style="margin: 5px 0;">Order Number: ${order.orderNumber}</p>
          </div>
          
          <div style="padding: 20px;">
            <h3>Dear ${order.customer.firstName},</h3>
            <p>Great news! Your order has been dispatched and is on its way to you.</p>
            
            <h3>Dispatch Details:</h3>
            <p><strong>Tracking Number:</strong> ${order.dispatch ? order.dispatch.trackingNumber : 'N/A'}</p>
            <p><strong>Courier:</strong> ${order.dispatch ? order.dispatch.courier : 'N/A'}</p>
            <p><strong>Dispatched Date:</strong> ${order.dispatch && order.dispatch.dispatchedAt ? new Date(order.dispatch.dispatchedAt).toLocaleDateString() : 'N/A'}</p>
            <p><strong>Estimated Delivery:</strong> ${order.dispatch && order.dispatch.estimatedDelivery ? new Date(order.dispatch.estimatedDelivery).toLocaleDateString() : 'N/A'}</p>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/orders/${order._id}/tracking" 
                 style="background-color: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
                Track Order
              </a>
            </div>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Dispatch notification email sent successfully');
    
    // Send SMS notification
    try {
      const smsResult = await sendDispatchNotificationSMS(order, order.customer);
      if (smsResult.success) {
        console.log('Dispatch SMS notification sent successfully');
      } else {
        console.log('Dispatch SMS notification failed:', smsResult.message);
      }
    } catch (smsError) {
      console.error('SMS notification failed:', smsError);
      // Don't fail the email if SMS fails
    }
    
  } catch (error) {
    console.error('Dispatch notification email failed:', error);
    throw error;
  }
};

// Send payment confirmation to back office
const sendPaymentConfirmation = async (order) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@komacut.com',
      to: process.env.BACKOFFICE_EMAIL || 'backoffice@komacut.com',
      subject: `Payment Confirmed - Order ${order.orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Payment Confirmed</h1>
            <p style="margin: 5px 0;">Order Number: ${order.orderNumber}</p>
          </div>
          
          <div style="padding: 20px;">
            <h3>Payment Details:</h3>
            <p><strong>Order Number:</strong> ${order.orderNumber}</p>
            <p><strong>Customer:</strong> ${order.customer.firstName} ${order.customer.lastName}</p>
            <p><strong>Amount:</strong> ${order.currency} ${order.totalAmount}</p>
            <p><strong>Payment Method:</strong> ${order.payment.method}</p>
            <p><strong>Transaction ID:</strong> ${order.payment.transactionId}</p>
            <p><strong>Paid At:</strong> ${new Date(order.payment.paidAt).toLocaleString()}</p>
            
            <h3>Next Steps:</h3>
            <p>1. Update order status to "confirmed"</p>
            <p>2. Set production timeline</p>
            <p>3. Begin manufacturing process</p>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/backoffice" 
                 style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
                Manage Order
              </a>
            </div>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Payment confirmation email sent to back office');
    
    // Send SMS notification to back office
    try {
      const smsResult = await sendPaymentConfirmationSMS(order, order.customer);
      if (smsResult.success) {
        console.log('Payment confirmation SMS notification sent successfully');
      } else {
        console.log('Payment confirmation SMS notification failed:', smsResult.message);
      }
    } catch (smsError) {
      console.error('SMS notification failed:', smsError);
      // Don't fail the email if SMS fails
    }
    
  } catch (error) {
    console.error('Payment confirmation email failed:', error);
    throw error;
  }
};

// Send delivery confirmation
const sendDeliveryConfirmation = async (order) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@komacut.com',
      to: order.customer.email,
      subject: `Order Delivered - ${order.orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Order Delivered</h1>
            <p style="margin: 5px 0;">Order Number: ${order.orderNumber}</p>
          </div>
          
          <div style="padding: 20px;">
            <h3>Dear ${order.customer.firstName},</h3>
            <p>Your order has been successfully delivered!</p>
            
            <h3>Delivery Details:</h3>
            <p><strong>Order Number:</strong> ${order.orderNumber}</p>
            <p><strong>Delivered Date:</strong> ${new Date(order.dispatch.actualDelivery).toLocaleDateString()}</p>
            <p><strong>Delivery Address:</strong> ${order.deliveryAddress.street}, ${order.deliveryAddress.city}</p>
            
            <h3>Thank You!</h3>
            <p>We appreciate your business and hope you're satisfied with your order. If you have any questions or need assistance, please don't hesitate to contact us.</p>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/inquiries/new" 
                 style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
                Place New Order
              </a>
            </div>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Delivery confirmation email sent successfully');
    
    // Send SMS notification
    if (order.customer.phoneNumber) {
      const smsMessage = `Order ${order.orderNumber} delivered successfully! Thank you for choosing Komacut.`;
      await sendSMS(order.customer.phoneNumber, smsMessage);
    }
    
  } catch (error) {
    console.error('Delivery confirmation email failed:', error);
    throw error;
  }
};

module.exports = {
  sendWelcomeEmail,
  sendInquiryNotification,
  sendQuotationEmail,
  sendOrderConfirmation,
  sendDispatchNotification,
  sendPaymentConfirmation,
  sendDeliveryConfirmation,
  sendSMS
};
