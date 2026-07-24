#!/usr/bin/env node

/**
 * Development Environment Setup Script
 * Automates the initial setup process for new developers
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configuration
const config = {
  requiredNodeVersion: '18.0.0',
  requiredNpmVersion: '9.0.0',
  services: ['docker', 'docker-compose'],
  envFiles: [
    { source: '.env.example', target: '.env' },
    { source: 'frontend/.env.example', target: 'frontend/.env' }
  ]
};

// Utility functions
function log(message, level = 'info') {
  const colors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m', // Green
    warning: '\x1b[33m', // Yellow
    error: '\x1b[31m',   // Red
    reset: '\x1b[0m'     // Reset
  };

  const icons = {
    info: '📋',
    success: '✅',
    warning: '⚠️',
    error: '❌'
  };

  console.log(`${colors[level]}${icons[level]} ${message}${colors.reset}`);
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

function getVersion(command) {
  return new Promise((resolve) => {
    exec(`${command} --version`, (error, stdout) => {
      if (error) {
        resolve(null);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function compareVersions(version1, version2) {
  const v1parts = version1.split('.').map(Number);
  const v2parts = version2.split('.').map(Number);

  for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
    const v1part = v1parts[i] || 0;
    const v2part = v2parts[i] || 0;

    if (v1part > v2part) return 1;
    if (v1part < v2part) return -1;
  }

  return 0;
}

async function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim());
    });
  });
}

// Setup steps
async function checkPrerequisites() {
  log('Checking prerequisites...', 'info');

  // Check Node.js version
  const nodeVersion = await getVersion('node');
  if (!nodeVersion) {
    log('Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/', 'error');
    return false;
  }

  const nodeVersionNumber = nodeVersion.replace('v', '');
  if (compareVersions(nodeVersionNumber, config.requiredNodeVersion) < 0) {
    log(`Node.js version ${nodeVersionNumber} is too old. Required: ${config.requiredNodeVersion}+`, 'error');
    return false;
  }

  log(`Node.js version: ${nodeVersion}`, 'success');

  // Check npm version
  const npmVersion = await getVersion('npm');
  if (!npmVersion) {
    log('npm is not installed. Please install npm.', 'error');
    return false;
  }

  if (compareVersions(npmVersion, config.requiredNpmVersion) < 0) {
    log(`npm version ${npmVersion} is too old. Required: ${config.requiredNpmVersion}+`, 'warning');
    log('Consider upgrading npm: npm install -g npm@latest', 'info');
  } else {
    log(`npm version: ${npmVersion}`, 'success');
  }

  // Check Docker
  const dockerVersion = await getVersion('docker');
  if (!dockerVersion) {
    log('Docker is not installed. Please install Docker from https://docker.com/', 'error');
    return false;
  }

  log(`Docker version: ${dockerVersion}`, 'success');

  // Check Docker Compose
  const composeVersion = await getVersion('docker-compose');
  if (!composeVersion) {
    log('Docker Compose is not installed. Please install Docker Compose.', 'error');
    return false;
  }

  log(`Docker Compose version: ${composeVersion}`, 'success');

  return true;
}

async function setupEnvironmentFiles() {
  log('Setting up environment files...', 'info');

  for (const envFile of config.envFiles) {
    const sourcePath = path.join(process.cwd(), envFile.source);
    const targetPath = path.join(process.cwd(), envFile.target);

    if (!fs.existsSync(sourcePath)) {
      log(`Source file ${envFile.source} not found`, 'error');
      continue;
    }

    if (fs.existsSync(targetPath)) {
      const overwrite = await askQuestion(`${envFile.target} already exists. Overwrite? (y/N): `);
      if (overwrite !== 'y' && overwrite !== 'yes') {
        log(`Skipping ${envFile.target}`, 'info');
        continue;
      }
    }

    fs.copyFileSync(sourcePath, targetPath);
    log(`Created ${envFile.target}`, 'success');
  }
}

async function installDependencies() {
  log('Installing dependencies...', 'info');

  try {
    log('Installing root dependencies...', 'info');
    await runCommand('npm', ['install']);

    log('Installing backend dependencies...', 'info');
    await runCommand('npm', ['install'], { cwd: 'backend' });

    log('Installing frontend dependencies...', 'info');
    await runCommand('npm', ['install'], { cwd: 'frontend' });

    log('Installing shared dependencies...', 'info');
    await runCommand('npm', ['install'], { cwd: 'shared' });

    log('All dependencies installed successfully!', 'success');
  } catch (error) {
    log(`Failed to install dependencies: ${error.message}`, 'error');
    throw error;
  }
}

async function buildDockerImages() {
  log('Building Docker images...', 'info');

  try {
    await runCommand('docker-compose', ['build']);
    log('Docker images built successfully!', 'success');
  } catch (error) {
    log(`Failed to build Docker images: ${error.message}`, 'error');
    throw error;
  }
}

async function startServices() {
  const startServices = await askQuestion('Start services now? (Y/n): ');

  if (startServices === 'n' || startServices === 'no') {
    log('Skipping service startup. You can start them later with: npm run dev', 'info');
    return;
  }

  log('Starting services...', 'info');

  try {
    await runCommand('docker-compose', ['up', '-d']);
    log('Services started successfully!', 'success');

    // Wait for services to be ready
    log('Waiting for services to be ready...', 'info');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check service health
    try {
      await runCommand('curl', ['-f', 'http://localhost:5000/health']);
      log('Backend service is healthy!', 'success');
    } catch (error) {
      log('Backend service may not be ready yet. Check with: curl http://localhost:5000/health', 'warning');
    }

    try {
      await runCommand('curl', ['-f', 'http://localhost:3000']);
      log('Frontend service is healthy!', 'success');
    } catch (error) {
      log('Frontend service may not be ready yet. Check with: curl http://localhost:3000', 'warning');
    }

  } catch (error) {
    log(`Failed to start services: ${error.message}`, 'error');
    log('You can try starting them manually with: docker-compose up', 'info');
  }
}

async function seedDatabase() {
  const seedDb = await askQuestion('Seed database with test data? (Y/n): ');

  if (seedDb === 'n' || seedDb === 'no') {
    log('Skipping database seeding. You can seed later with: docker-compose exec backend npm run seed', 'info');
    return;
  }

  log('Seeding database...', 'info');
  log('Running seed command inside Docker container...', 'info');

  try {
    // Run seed command inside the backend Docker container
    await runCommand('docker-compose', ['exec', '-T', 'backend', 'npm', 'run', 'seed']);
    log('Database seeded successfully!', 'success');
  } catch (error) {
    log(`Failed to seed database: ${error.message}`, 'error');
    log('You can try seeding manually with: docker-compose exec backend npm run seed', 'info');
  }
}

async function showCompletionInfo() {
  log('Setup completed successfully! 🎉', 'success');

  console.log('\n' + '='.repeat(60));
  console.log('🚀 CAB AGGREGATOR LOCAL EDITION - READY TO GO!');
  console.log('='.repeat(60));

  console.log('\n📋 Available Services:');
  console.log('  • Frontend:  http://localhost:3000');
  console.log('  • Backend:   http://localhost:5000');
  console.log('  • API Docs:  http://localhost:5000/api');
  console.log('  • Health:    http://localhost:5000/health');
  console.log('  • MongoDB:   localhost:27017');
  console.log('  • Redis:     localhost:6379');

  console.log('\n🔐 Test Credentials:');
  console.log('  • Admin:  admin@cabaggreg.local / admin123');
  console.log('  • Rider:  1234567890 / demoRider123');
  console.log('  • Driver: 1234567899 / demoDriver123');

  console.log('\n🛠️  Useful Commands:');
  console.log('  • Start all services:     npm run dev');
  console.log('  • Stop all services:      docker-compose down');
  console.log('  • View logs:              docker-compose logs -f');
  console.log('  • Run tests:              npm run test:all');
  console.log('  • Seed database:          docker-compose exec backend npm run seed');
  console.log('  • Clean everything:       npm run clean');

  console.log('\n📚 Next Steps:');
  console.log('  1. Open http://localhost:3000 in your browser');
  console.log('  2. Register as a new user or use test credentials');
  console.log('  3. Explore the rider, driver, and admin interfaces');
  console.log('  4. Check the API documentation at http://localhost:5000/api');
  console.log('  5. Run tests to ensure everything works: npm run test:all');

  console.log('\n💡 Need Help?');
  console.log('  • Check README.md for detailed documentation');
  console.log('  • View logs: docker-compose logs [service-name]');
  console.log('  • Restart services: docker-compose restart');
  console.log('  • Reset everything: npm run clean && npm run dev');

  console.log('\n' + '='.repeat(60));
}

// Main setup function
async function main() {
  try {
    console.log('🚀 CAB AGGREGATOR LOCAL EDITION - DEVELOPMENT SETUP');
    console.log('='.repeat(60));

    // Check prerequisites
    const prereqsOk = await checkPrerequisites();
    if (!prereqsOk) {
      log('Prerequisites check failed. Please install required software and try again.', 'error');
      process.exit(1);
    }

    // Setup environment files
    await setupEnvironmentFiles();

    // Install dependencies
    await installDependencies();

    // Build Docker images
    await buildDockerImages();

    // Start services
    await startServices();

    // Seed database
    await seedDatabase();

    // Show completion info
    await showCompletionInfo();

  } catch (error) {
    log(`Setup failed: ${error.message}`, 'error');
    console.log('\n💡 Troubleshooting:');
    console.log('  • Make sure Docker is running');
    console.log('  • Check that ports 3000, 5000, 27017, 6379 are available');
    console.log('  • Try running: docker-compose down && docker system prune -f');
    console.log('  • Check the logs: docker-compose logs');
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  log('Setup interrupted by user', 'warning');
  process.exit(1);
});

process.on('SIGTERM', () => {
  log('Setup terminated', 'warning');
  process.exit(1);
});

// Run setup if called directly
if (require.main === module) {
  main();
}

module.exports = { main };