const express = require('express');

// Build a minimal Express app for integration/system tests
// Uses in-memory Mongo (configured in __tests__/setup.js) and wires only routes
module.exports = function createTestApp() {
    const app = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Mount routes (middle-wares within routes will be applied as authored)
    app.use('/api/auth', require('../../routes/auth'));
    app.use('/api/rides', require('../../routes/rides'));
    app.use('/api/users', require('../../routes/users'));

    // Basic not-found handler for tests
    app.use('*', (req, res) => {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    });

    return app;
};
