const twilio = require('twilio');

// Initialize Twilio client
let twilioClient = null;
let isTwilioConfigured = false;

const initializeTwilio = () => {
  try {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && 
        process.env.TWILIO_ACCOUNT_SID.startsWith('AC') && 
        process.env.TWILIO_ACCOUNT_SID !== 'your-twilio-account-sid') {
      twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      isTwilioConfigured = true;
      console.log('Twilio SMS service initialized successfully');
    } else {
      console.warn('Twilio credentials not configured or invalid. SMS service will be disabled.');
      isTwilioConfigured = false;
    }
  } catch (error) {
    console.error('Failed to initialize Twilio:', error);
    isTwilioConfigured = false;
  }
};

// Send SMS using Twilio
const sendSMS = async (phoneNumber, message) => {
  try {
    if (!isTwilioConfigured || !twilioClient) {
      console.log(`SMS to ${phoneNumber}: ${message} (Twilio not configured)`);
      return { success: false, message: 'SMS service not configured' };
    }

    // Format phone number (add + if not present)
    let formattedNumber = phoneNumber;
    if (!phoneNumber.startsWith('+')) {
      formattedNumber = `+${phoneNumber}`;
    }

    // Send SMS
    const result = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedNumber
    });

    console.log(`SMS sent successfully to ${phoneNumber}. SID: ${result.sid}`);
    return { 
      success: true, 
      messageId: result.sid,
      status: result.status,
      to: result.to
    };

  } catch (error) {
    console.error('SMS sending failed:', error);
    return { 
      success: false, 
      error: error.message,
      code: error.code 
    };
  }
};

// Send bulk SMS to multiple numbers
const sendBulkSMS = async (phoneNumbers, message) => {
  try {
    if (!isTwilioConfigured || !twilioClient) {
      console.log(`Bulk SMS to ${phoneNumbers.length} numbers: ${message} (Twilio not configured)`);
      return { success: false, message: 'SMS service not configured' };
    }

    const results = [];
    const promises = phoneNumbers.map(async (phoneNumber) => {
      const result = await sendSMS(phoneNumber, message);
      results.push({ phoneNumber, result });
      return result;
    });

    await Promise.all(promises);
    
    const successCount = results.filter(r => r.result.success).length;
    console.log(`Bulk SMS completed: ${successCount}/${phoneNumbers.length} successful`);
    
    return {
      success: true,
      total: phoneNumbers.length,
      successful: successCount,
      failed: phoneNumbers.length - successCount,
      results
    };

  } catch (error) {
    console.error('Bulk SMS failed:', error);
    return { success: false, error: error.message };
  }
};

// Send inquiry notification SMS
const sendInquiryNotificationSMS = async (inquiry, customerInfo) => {
  try {
    if (!process.env.BACKOFFICE_PHONE) {
      console.warn('Back office phone number not configured for SMS notifications');
      console.log('SMS to Back Office: New inquiry notification (phone not configured)');
      return { success: false, message: 'Back office phone not configured' };
    }

    const message = `New inquiry ${inquiry.inquiryNumber} received from ${customerInfo.firstName} ${customerInfo.lastName}. ${inquiry.parts.length} parts, ${inquiry.files.length} files. Please review.`;
    
    const result = await sendSMS(process.env.BACKOFFICE_PHONE, message);
    console.log('Inquiry notification SMS result:', result);
    return result;

  } catch (error) {
    console.error('Inquiry notification SMS failed:', error);
    return { success: false, error: error.message };
  }
};

// Send quotation notification SMS
const sendQuotationNotificationSMS = async (quotation, customerInfo) => {
  try {
    if (!customerInfo.phoneNumber) {
      console.warn('Customer phone number not available for quotation SMS');
      console.log('SMS to Customer: Quotation notification (phone not available)');
      return { success: false, message: 'Customer phone not available' };
    }

    const message = `Quotation ${quotation.quotationNumber} ready for inquiry ${quotation.inquiry.inquiryNumber}. Total: $${quotation.totalAmount}. Valid until ${new Date(quotation.validUntil).toLocaleDateString()}. Check your email for details.`;
    
    const result = await sendSMS(customerInfo.phoneNumber, message);
    console.log('Quotation notification SMS result:', result);
    return result;

  } catch (error) {
    console.error('Quotation notification SMS failed:', error);
    return { success: false, error: error.message };
  }
};

// Send order confirmation SMS
const sendOrderConfirmationSMS = async (order, customerInfo) => {
  try {
    if (!customerInfo.phoneNumber) {
      console.warn('Customer phone number not available for order confirmation SMS');
      console.log('SMS to Customer: Order confirmation (phone not available)');
      return { success: false, message: 'Customer phone not available' };
    }

    const message = `Order ${order.orderNumber} confirmed! Production started. Estimated completion: ${new Date(order.production.estimatedCompletion).toLocaleDateString()}. We'll keep you updated.`;
    
    const result = await sendSMS(customerInfo.phoneNumber, message);
    console.log('Order confirmation SMS result:', result);
    return result;

  } catch (error) {
    console.error('Order confirmation SMS failed:', error);
    return { success: false, error: error.message };
  }
};

// Send dispatch notification SMS
const sendDispatchNotificationSMS = async (order, customerInfo) => {
  try {
    if (!customerInfo.phoneNumber) {
      console.warn('Customer phone number not available for dispatch SMS');
      console.log('SMS to Customer: Dispatch notification (phone not available)');
      return { success: false, message: 'Customer phone not available' };
    }

    const message = `Order ${order.orderNumber} dispatched! Tracking: ${order.dispatch.trackingNumber}. Courier: ${order.dispatch.courier}. Estimated delivery: ${new Date(order.dispatch.estimatedDelivery).toLocaleDateString()}.`;
    
    const result = await sendSMS(customerInfo.phoneNumber, message);
    console.log('Dispatch notification SMS result:', result);
    return result;

  } catch (error) {
    console.error('Dispatch notification SMS failed:', error);
    return { success: false, error: error.message };
  }
};

// Send payment confirmation SMS to back office
const sendPaymentConfirmationSMS = async (order, customerInfo) => {
  try {
    if (!process.env.BACKOFFICE_PHONE) {
      console.warn('Back office phone number not configured for payment confirmation SMS');
      console.log('SMS to Back Office: Payment confirmation (phone not configured)');
      return { success: false, message: 'Back office phone not configured' };
    }

    const message = `Payment confirmed for order ${order.orderNumber}. Customer: ${customerInfo.firstName} ${customerInfo.lastName}. Amount: $${order.totalAmount}. Please update order status.`;
    
    const result = await sendSMS(process.env.BACKOFFICE_PHONE, message);
    console.log('Payment confirmation SMS result:', result);
    return result;

  } catch (error) {
    console.error('Payment confirmation SMS failed:', error);
    return { success: false, error: error.message };
  }
};

// Initialize Twilio when module is loaded
initializeTwilio();

module.exports = {
  sendSMS,
  sendBulkSMS,
  sendInquiryNotificationSMS,
  sendQuotationNotificationSMS,
  sendOrderConfirmationSMS,
  sendDispatchNotificationSMS,
  sendPaymentConfirmationSMS,
  isTwilioConfigured
};
