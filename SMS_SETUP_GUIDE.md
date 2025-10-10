# SMS Service Setup Guide

## Overview
The SMS service is implemented using Twilio and is already integrated into the application. This guide will help you configure it properly.

## Prerequisites
1. Twilio Account (https://www.twilio.com/)
2. Twilio Phone Number
3. Twilio Account SID and Auth Token

## Step 1: Create Twilio Account
1. Go to https://www.twilio.com/
2. Sign up for a free account
3. Verify your phone number
4. Get your Account SID and Auth Token from the Twilio Console

## Step 2: Get Twilio Phone Number
1. In Twilio Console, go to Phone Numbers > Manage > Buy a number
2. Choose a phone number (preferably with SMS capabilities)
3. Note down the phone number (format: +1234567890)

## Step 3: Configure Environment Variables
Add these variables to your `.env` file:

```env
# SMS Configuration (Twilio)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Back Office Contact Information
BACKOFFICE_EMAIL=backoffice@komacut.com
BACKOFFICE_PHONE=+1234567890
```

## Step 4: Test SMS Service
The SMS service will automatically initialize when the server starts. You can test it by:

1. Starting the server
2. Creating an inquiry (this will trigger SMS to back office)
3. Creating a quotation (this will trigger SMS to customer)

## SMS Features Implemented

### 1. Inquiry Notification SMS
- **Trigger**: When customer submits inquiry
- **Recipient**: Back Office
- **Message**: "New inquiry INQ123456 received from John Doe. 3 parts, 2 files. Please review."

### 2. Quotation Notification SMS
- **Trigger**: When quotation is sent to customer
- **Recipient**: Customer
- **Message**: "Quotation QUO123456 ready for inquiry INQ123456. Total: $500. Valid until 12/31/2024. Check your email for details."

### 3. Order Confirmation SMS
- **Trigger**: When order is confirmed
- **Recipient**: Customer
- **Message**: "Order ORD123456 confirmed! Production started. Estimated completion: 12/15/2024. We'll keep you updated."

### 4. Dispatch Notification SMS
- **Trigger**: When order is dispatched
- **Recipient**: Customer
- **Message**: "Order ORD123456 dispatched! Tracking: TRK123456. Courier: FedEx. Estimated delivery: 12/20/2024."

### 5. Payment Confirmation SMS
- **Trigger**: When payment is confirmed
- **Recipient**: Back Office
- **Message**: "Payment confirmed for order ORD123456. Customer: John Doe. Amount: $500. Please update order status."

## Troubleshooting

### SMS Not Sending
1. Check if Twilio credentials are correct
2. Verify phone number format (should start with +)
3. Check Twilio account balance
4. Review server logs for error messages

### Common Issues
1. **Invalid phone number format**: Ensure phone numbers start with country code (e.g., +1 for US)
2. **Insufficient balance**: Add funds to your Twilio account
3. **Wrong credentials**: Double-check Account SID and Auth Token

## Cost Considerations
- Twilio charges per SMS sent
- Free trial includes limited SMS credits
- Check Twilio pricing for production usage

## Security Notes
- Never commit Twilio credentials to version control
- Use environment variables for all sensitive data
- Regularly rotate Auth Tokens
- Monitor SMS usage for unusual activity

## Support
- Twilio Documentation: https://www.twilio.com/docs
- Twilio Support: https://support.twilio.com/
- Application Logs: Check server console for SMS-related errors








