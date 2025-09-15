const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
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

// Extract data from PDF
router.post('/extract-pdf-data', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No PDF file uploaded'
      });
    }

    // Parse PDF content
    const pdfData = await pdfParse(req.file.buffer);
    const text = pdfData.text;

    console.log('PDF Text extracted:', text);

    // Extract part specifications from PDF text
    const parts = extractPartSpecifications(text);

    res.json({
      success: true,
      parts: parts,
      extractedText: text
    });

  } catch (error) {
    console.error('PDF extraction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to extract data from PDF',
      error: error.message
    });
  }
});

// Function to extract part specifications from PDF text
function extractPartSpecifications(text) {
  const parts = [];
  
  // Common patterns for part specifications
  const patterns = [
    // Pattern 1: Material, Thickness, Grade, Quantity format
    /(?:material|Material|MATERIAL)[\s:]*([^\n\r,]+)[\s,]*thickness[\s:]*([^\n\r,]+)[\s,]*grade[\s:]*([^\n\r,]+)[\s,]*quantity[\s:]*(\d+)/gi,
    
    // Pattern 2: Part specifications in table format
    /([A-Za-z\s]+)[\s]*([0-9.]+mm?)[\s]*([A-Za-z0-9-]+)[\s]*(\d+)/g,
    
    // Pattern 3: Material specifications
    /(Steel|Aluminum|Stainless|Copper|Brass|Mild Steel|Carbon Steel)[\s,]*([0-9.]+mm?)[\s,]*([A-Za-z0-9-]+)[\s,]*(\d+)/gi,
    
    // Pattern 4: Generic part specifications
    /([A-Za-z\s]+)[\s]*([0-9.]+)[\s]*([A-Za-z0-9-]+)[\s]*(\d+)/g
  ];

  // Try each pattern
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const material = match[1]?.trim() || '';
      const thickness = match[2]?.trim() || '';
      const grade = match[3]?.trim() || '';
      const quantity = match[4]?.trim() || '';

      // Validate extracted data
      if (material && thickness && grade && quantity && !isNaN(quantity)) {
        parts.push({
          material: material,
          thickness: thickness,
          grade: grade,
          quantity: parseInt(quantity),
          remarks: `Extracted from PDF: ${material} ${thickness} ${grade}`
        });
      }
    }
  }

  // If no parts found with patterns, try to extract common specifications
  if (parts.length === 0) {
    // Look for common material specifications
    const materialMatches = text.match(/(Steel|Aluminum|Stainless|Copper|Brass|Mild Steel|Carbon Steel)/gi);
    const thicknessMatches = text.match(/([0-9.]+mm?)/g);
    const quantityMatches = text.match(/(\d+)\s*(?:pcs|pieces|units|qty|quantity)/gi);

    if (materialMatches && thicknessMatches && quantityMatches) {
      const material = materialMatches[0];
      const thickness = thicknessMatches[0];
      const quantity = quantityMatches[0].match(/\d+/)[0];

      parts.push({
        material: material,
        thickness: thickness,
        grade: 'Standard',
        quantity: parseInt(quantity),
        remarks: 'Extracted from PDF specifications'
      });
    }
  }

  // If still no parts found, create a default part
  if (parts.length === 0) {
    parts.push({
      material: 'Steel',
      thickness: '2mm',
      grade: 'A36',
      quantity: 100,
      remarks: 'Default specification - please update as needed'
    });
  }

  return parts;
}

module.exports = router;
