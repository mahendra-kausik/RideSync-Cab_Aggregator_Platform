const request = require('supertest');
const createTestApp = require('../helpers/testApp');
const { OTP } = require('../../models');

// Regression for P-019: GET /users/admin/users?search=... used to $regex against
// profile.name/email/phone, which are encrypted at rest with a random IV per value
// - the regex could never match, so search always returned zero results.
describe('Admin Users API - search (Integration)', () => {
    let app;
    let adminToken;

    beforeAll(() => {
        app = createTestApp();
    });

    beforeEach(async () => {
        // Note: after .save(), the in-memory document's PII fields are still
        // ciphertext (only find/init hooks and toJSON() decrypt) - keep the
        // plaintext locally instead of reading it back off the created doc.
        const adminEmail = 'admin-search-test@test.local';
        await global.testUtils.createTestUser({
            email: adminEmail,
            password: 'AdminPass#1',
            role: 'admin',
            profile: { name: 'Search Test Admin' }
        });
        const login = await request(app).post('/api/auth/login-email')
            .send({ email: adminEmail, password: 'AdminPass#1' });
        expect(login.status).toBe(200);
        adminToken = login.body.data.tokens.accessToken;
    });

    async function registerRider(phone, name) {
        await request(app).post('/api/auth/register-phone').send({
            phone,
            profile: { name },
            role: 'rider'
        }).expect(200);
        const otpDoc = await OTP.findOne({ phone });
        await request(app).post('/api/auth/verify-otp')
            .send({ phone, otp: otpDoc.otp, password: 'Rider#12345' }).expect(201);
    }

    it('finds a user by a case-insensitive partial name match, ignoring unrelated users', async () => {
        await registerRider('5550003001', 'Zara Uniquename');
        await registerRider('5550003002', 'Bob Common');

        const res = await request(app)
            .get('/api/users/admin/users')
            .query({ search: 'uniquename' })
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].profile.name).toBe('Zara Uniquename');
        expect(res.body.pagination.total).toBe(1);
        expect(res.body.pagination.pages).toBe(1);
    });

    it('returns no results for a search term that matches nobody', async () => {
        await registerRider('5550003003', 'Someone Else');

        const res = await request(app)
            .get('/api/users/admin/users')
            .query({ search: 'nonexistent-search-term' })
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(0);
        expect(res.body.pagination.total).toBe(0);
    });
});

// Regression: GET /users/admin/stats used to sum every role bucket into
// users.total/activeUsers, including the admin who is always excluded from
// getAllUsers - so the dashboard's "Total Users" count never matched the list.
describe('Admin Users API - platform stats (Integration)', () => {
    let app;
    let adminToken;

    beforeAll(() => {
        app = createTestApp();
    });

    beforeEach(async () => {
        const adminEmail = 'admin-stats-test@test.local';
        await global.testUtils.createTestUser({
            email: adminEmail,
            password: 'AdminPass#1',
            role: 'admin',
            profile: { name: 'Stats Test Admin' }
        });
        const login = await request(app).post('/api/auth/login-email')
            .send({ email: adminEmail, password: 'AdminPass#1' });
        expect(login.status).toBe(200);
        adminToken = login.body.data.tokens.accessToken;
    });

    it('excludes admins from users.total and users.activeUsers, but still reports users.admins', async () => {
        await global.testUtils.createTestUser({ phone: '5550004001', role: 'rider', profile: { name: 'Stats Rider' } });
        await global.testUtils.createTestDriver({ phone: '5550004002', profile: { name: 'Stats Driver' } });

        const res = await request(app)
            .get('/api/users/admin/stats')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        // One rider + one driver - the admin used to obtain the token is excluded
        expect(res.body.data.users.total).toBe(2);
        expect(res.body.data.users.activeUsers).toBe(2);
        expect(res.body.data.users.admins).toBe(1);
    });
});
