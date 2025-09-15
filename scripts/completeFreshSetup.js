const mongoose = require('mongoose');
const Quotation = require('../models/Quotation');
const Inquiry = require('../models/Inquiry');
const User = require('../models/User');
require('dotenv').config();

async function completeFreshSetup() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/komacut');
    console.log('Connected to MongoDB');

    // Find customer user
    const customer = await User.findOne({ 
      $or: [
        { email: 'bhushan@gmail.com' },
        { firstName: 'bhushan', lastName: 'jadhav' }
      ]
    });
    
    if (!customer) {
      console.log('❌ Customer not found');
      return;
    }

    console.log('✅ Customer found:', customer.firstName, customer.lastName);

    // Create new inquiry
    const inquiry = new Inquiry({
      customer: customer._id,
      status: 'pending',
      parts: [{
        material: 'Aluminum',
        thickness: '5mm',
        quantity: 25,
        remarks: 'Fresh test part for quotation response'
      }],
      totalAmount: 0,
      currency: 'USD',
      deliveryAddress: {
        street: 'Fresh Test Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'India',
        zipCode: '400001'
      },
      specialInstructions: 'Fresh inquiry for testing quotation response functionality',
      files: [{
        originalName: 'fresh-test-file.dwg',
        fileName: 'fresh-test-file.dwg',
        filePath: '/uploads/fresh-test-file.dwg',
        fileSize: 2048,
        fileType: 'application/dwg'
      }]
    });

    await inquiry.save();
    console.log('✅ Fresh inquiry created:', inquiry.inquiryNumber);

    // Create fresh quotation
    const quotation = new Quotation({
      inquiry: inquiry._id,
      quotationNumber: `QT${Date.now()}`,
      parts: inquiry.parts.map(part => ({
        partRef: part.material + '_' + part.thickness,
        material: part.material,
        thickness: part.thickness,
        quantity: part.quantity,
        unitPrice: 20.00, // Example price
        totalPrice: 20.00 * part.quantity
      })),
      totalAmount: inquiry.parts.reduce((total, part) => total + (20.00 * part.quantity), 0),
      currency: 'USD',
      status: 'sent', // Set to sent so customer can respond
      sentAt: new Date(),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      terms: 'Standard manufacturing terms apply. Payment required before production begins.',
      notes: 'Fresh quotation for testing customer response functionality',
      preparedBy: customer._id
    });

    await quotation.save();
    console.log('✅ Fresh quotation created:', quotation.quotationNumber);

    // Update inquiry with quotation reference
    inquiry.status = 'quoted';
    inquiry.quotation = quotation._id;
    await inquiry.save();
    console.log('✅ Inquiry updated with quotation reference');

    console.log('\n🎯 Complete Fresh Setup Details:');
    console.log('Inquiry ID:', inquiry._id);
    console.log('Inquiry Number:', inquiry.inquiryNumber);
    console.log('Quotation ID:', quotation._id);
    console.log('Quotation Number:', quotation.quotationNumber);
    console.log('Status:', quotation.status);
    console.log('Total Amount:', quotation.totalAmount);

    console.log('\n📋 Customer Portal Steps:');
    console.log('1. Go to: http://localhost:3000');
    console.log('2. Login as customer');
    console.log('3. Go to "My Inquiries"');
    console.log('4. Click on inquiry:', inquiry.inquiryNumber);
    console.log('5. You should see Accept/Reject buttons');
    console.log('6. Click "Accept Quotation"');
    console.log('7. Add notes and click "Accept & Pay"');

    console.log('\n🔑 Customer Token for Testing:');
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { 
        userId: customer._id, 
        email: customer.email, 
        role: customer.role 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    console.log(token);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

completeFreshSetup();
