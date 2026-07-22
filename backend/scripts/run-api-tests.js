#!/usr/bin/env node

/**
 * Newman CLI Script for Automated API Testing
 * Runs Postman collection with Newman for CI/CD integration
 */

const newman = require('newman');
const path = require('path');
const fs = require('fs');

// Configuration
const config = {
  collection: path.join(__dirname, '../postman/cab-aggregator-api.postman_collection.json'),
  environment: path.join(__dirname, '../postman/cab-aggregator-local.postman_environment.json'),
  reporters: ['cli', 'json', 'html'],
  reporter: {
    html: {
      export: path.join(__dirname, '../test-results/newman-report.html')
    },
    json: {
      export: path.join(__dirname, '../test-results/newman-report.json')
    }
  },
  insecure: true, // For local development with self-signed certificates
  timeout: 30000,
  delayRequest: 500, // 500ms delay between requests
  iterationCount: 1,
  bail: false // Continue on failures
};

// Ensure test results directory exists
const testResultsDir = path.join(__dirname, '../test-results');
if (!fs.existsSync(testResultsDir)) {
  fs.mkdirSync(testResultsDir, { recursive: true });
}

console.log('🚀 Starting API Tests with Newman...\n');
console.log(`Collection: ${config.collection}`);
console.log(`Environment: ${config.environment}`);
console.log(`Reports will be saved to: ${testResultsDir}\n`);

// Run Newman
newman.run(config, function (err, summary) {
  if (err) {
    console.error('❌ Newman run failed:', err);
    process.exit(1);
  }

  console.log('\n📊 Test Summary:');
  console.log(`Total Requests: ${summary.run.stats.requests.total}`);
  console.log(`Passed Requests: ${summary.run.stats.requests.total - summary.run.stats.requests.failed}`);
  console.log(`Failed Requests: ${summary.run.stats.requests.failed}`);
  console.log(`Total Assertions: ${summary.run.stats.assertions.total}`);
  console.log(`Passed Assertions: ${summary.run.stats.assertions.total - summary.run.stats.assertions.failed}`);
  console.log(`Failed Assertions: ${summary.run.stats.assertions.failed}`);

  if (summary.run.failures && summary.run.failures.length > 0) {
    console.log('\n❌ Test Failures:');
    summary.run.failures.forEach((failure, index) => {
      console.log(`${index + 1}. ${failure.error.name}: ${failure.error.message}`);
      if (failure.source && failure.source.name) {
        console.log(`   Request: ${failure.source.name}`);
      }
    });
  }

  // Exit with appropriate code
  const exitCode = summary.run.failures.length > 0 ? 1 : 0;

  if (exitCode === 0) {
    console.log('\n✅ All API tests passed!');
  } else {
    console.log('\n❌ Some API tests failed. Check the reports for details.');
  }

  console.log('\n📄 Detailed reports available at:');
  console.log(`HTML: ${config.reporter.html.export}`);
  console.log(`JSON: ${config.reporter.json.export}`);

  process.exit(exitCode);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n⚠️  Test execution interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Test execution terminated');
  process.exit(1);
});