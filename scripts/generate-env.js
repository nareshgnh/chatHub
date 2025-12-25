const fs = require('fs');
const path = require('path');

// Only run if GROQ_API_KEY environment variable is present
// This protects local development where you might have a manual env.js
if (process.env.GROQ_API_KEY) {
    const envContent = `window.ENV = {
    GROQ_API_KEY: '${process.env.GROQ_API_KEY}'
};`;

    const outputPath = path.join(__dirname, '../js/env.js');

    try {
        fs.writeFileSync(outputPath, envContent);
        console.log('Successfully generated js/env.js from environment variables.');
    } catch (error) {
        console.error('Error writing js/env.js:', error);
        process.exit(1);
    }
} else {
    console.log('GROQ_API_KEY not found in environment variables. Skipping js/env.js generation.');
}
