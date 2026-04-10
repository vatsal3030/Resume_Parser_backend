// Load environment variables FIRST, before any other module imports.
// In ES modules, all static imports are resolved before any code runs,
// so we use a dedicated env loader module imported at the very top.
import './config/env.js';
import app from './app.js';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
