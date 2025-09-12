const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function seedDefaultData() {
  try {
    console.log('🌱 Initializing system data...');

    // Run the import-merchant-catalog script to initialize canonical categories
    console.log('📊 Running merchant catalog import...');

    // Use ts-node to run the TypeScript file
    const { stdout, stderr } = await execAsync('cd /app && npx ts-node --project tsconfig.json scripts/import-merchant-catalog.ts');

    if (stdout) {
      console.log(stdout);
    }

    if (stderr) {
      console.error('Script warnings:', stderr);
    }

    console.log('✅ System initialization complete');

  } catch (error) {
    console.error('❌ Error during system initialization:', error);

    // If merchant catalog import fails, just log and continue
    // This allows the container to start even if merchant data is missing
    console.log('⚠️ Continuing without merchant catalog data...');
  }
}// Run if called directly
if (require.main === module) {
  seedDefaultData()
    .then(() => {
      console.log('✅ System data initialization completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Initialization failed:', error);
      process.exit(1);
    });
}

module.exports = { seedDefaultData };
