const { db } = require('../lib/db');
const { experimentSamples } = require('../lib/db/schema/experiment');

async function check() {
  try {
    const result = await db.select().from(experimentSamples).limit(1);
    console.log('Query successful, first row keys:', result[0] ? Object.keys(result[0]) : 'No data rows');
  } catch (err) {
    console.error('Error querying table:', err);
  }
  process.exit(0);
}

check();
