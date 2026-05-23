import dotenv from 'dotenv';
dotenv.config();

// Automatically strip accidental double quotes from environment variables
// This prevents crashes on Render if variables are pasted as "value" instead of value
for (const key in process.env) {
  if (typeof process.env[key] === 'string') {
    const val = process.env[key].trim();
    if (val.startsWith('"') && val.endsWith('"') && val.length > 1) {
      process.env[key] = val.slice(1, -1);
    }
  }
}
