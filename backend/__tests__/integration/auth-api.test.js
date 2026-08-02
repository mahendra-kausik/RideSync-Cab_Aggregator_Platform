const request = require('supertest');
const createTestApp = require('../helpers/testApp');
const { OTP } = require('../../models');

// Single clean auth integration suite (removed duplicated legacy suites)
describe('Authentication API (Integration)', () => {
    let app;

    beforeAll(() => {
      app = createTestApp();
    });

    describe('POST /api/auth/register-phone', () => {
        it('registers new rider and creates OTP record', async () => {
            const phone = '5550000001';
            const res = await request(app).post('/api/auth/register-phone').send({ phone, profile: { name: 'Alice Rider' }, role: 'rider' });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            const otpDoc = await OTP.findOne({ phone });
            expect(otpDoc).toBeTruthy();
            expect(otpDoc.isUsed).toBe(false);
        });

        it('rejects duplicate registration', async () => {
            const phone = '5550000002';
            // Use testUtils to ensure proper password hashing and phone encryption
            await global.testUtils.createTestUser({ phone, role: 'rider', profile: { name: 'Existing Rider' } });
            const res = await request(app).post('/api/auth/register-phone').send({ phone, profile: { name: 'Another' }, role: 'rider' });
            expect(res.status).toBe(409);
            expect(res.body.error.code).toBe('USER_ALREADY_EXISTS');
        });
    }); describe('POST /api/auth/verify-otp', () => {
        it('verifies OTP, creates user and returns tokens', async () => {
            const phone = '5550000003';
            await request(app).post('/api/auth/register-phone').send({ phone, profile: { name: 'Bob Rider' }, role: 'rider' }).expect(200);
            const otpDoc = await OTP.findOne({ phone });
            const res = await request(app).post('/api/auth/verify-otp').send({ phone, otp: otpDoc.otp, password: 'Rider#123' });
            expect(res.status).toBe(201);
            expect(res.body.data.user.role).toBe('rider');
            expect(res.body.data.tokens.accessToken).toBeDefined();
        });

        it('rejects invalid OTP', async () => {
            const phone = '5550000004';
            await request(app).post('/api/auth/register-phone').send({ phone, profile: { name: 'Carol' }, role: 'rider' }).expect(200);
            const res = await request(app).post('/api/auth/verify-otp').send({ phone, otp: '000000', password: 'Secret#1' });
            expect([400, 429]).toContain(res.status);
        });

        // Regression for P-017: role/name/driverInfo must survive verify-otp even
        // when the client never echoes registration data back (production behavior).
        it('persists driver role and vehicle details from server-side pending registration', async () => {
            const phone = '5550000006';
            await request(app).post('/api/auth/register-phone').send({
                phone,
                profile: { name: 'Dave Driver' },
                role: 'driver',
                driverInfo: {
                    licenseNumber: 'DL12345',
                    vehicleDetails: { make: 'Toyota', model: 'Camry', plateNumber: 'ABC123', color: 'Blue' }
                }
            }).expect(200);
            const otpDoc = await OTP.findOne({ phone });
            const res = await request(app).post('/api/auth/verify-otp').send({ phone, otp: otpDoc.otp, password: 'Driver#123' });
            expect(res.status).toBe(201);
            expect(res.body.data.user.role).toBe('driver');
            expect(res.body.data.user.profile.name).toBe('Dave Driver');
            expect(res.body.data.user.driverInfo.licenseNumber).toBe('DL12345');
            expect(res.body.data.user.driverInfo.vehicleDetails.plateNumber).toBe('ABC123');
        });

        it('rejects verify-otp when pending registration has expired/is missing', async () => {
            const phone = '5550000007';
            await request(app).post('/api/auth/register-phone').send({ phone, profile: { name: 'Erin' }, role: 'rider' }).expect(200);
            const otpDoc = await OTP.findOne({ phone });
            await OTP.updateOne({ _id: otpDoc._id }, { pendingRegistration: null });
            const res = await request(app).post('/api/auth/verify-otp').send({ phone, otp: otpDoc.otp, password: 'Secret#123' });
            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('REGISTRATION_EXPIRED');
        });
    });

    describe('POST /api/auth/login-phone', () => {
        it('logs in existing rider with valid credentials', async () => {
            // createTestUser will hash the password via pre-save hook, so pass plaintext
            await global.testUtils.createTestUser({
                phone: '5550000005',
                password: 'RiderPass!1',  // Pass plaintext, not hashed
                role: 'rider',
                profile: { name: 'Login Rider' }
            });
            const res = await request(app).post('/api/auth/login-phone').send({ phone: '5550000005', password: 'RiderPass!1' });
            expect(res.status).toBe(200);
            expect(res.body.data.tokens.accessToken).toBeDefined();
        });

        it('rejects invalid credentials', async () => {
            const res = await request(app).post('/api/auth/login-phone').send({ phone: '5550009999', password: 'nope' });
            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
        });
    });

    describe('POST /api/auth/logout', () => {
        it('revokes the session — the same access token is rejected on the next request', async () => {
            await global.testUtils.createTestUser({
                phone: '5550000010',
                password: 'LogoutPass!1',
                role: 'rider',
                profile: { name: 'Logout Rider' }
            });
            const login = await request(app).post('/api/auth/login-phone').send({ phone: '5550000010', password: 'LogoutPass!1' });
            const { accessToken } = login.body.data.tokens;

            const logout = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${accessToken}`);
            expect(logout.status).toBe(200);
            expect(logout.body.success).toBe(true);

            const replay = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${accessToken}`);
            expect(replay.status).toBe(401);
        });
    });

    describe('POST /api/auth/refresh', () => {
        it('exchanges a refresh token for a new pair and blacklists the old refresh token', async () => {
            await global.testUtils.createTestUser({
                phone: '5550000011',
                password: 'RefreshPass!1',
                role: 'rider',
                profile: { name: 'Refresh Rider' }
            });
            const login = await request(app).post('/api/auth/login-phone').send({ phone: '5550000011', password: 'RefreshPass!1' });
            const { refreshToken } = login.body.data.tokens;

            const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
            expect(res.status).toBe(200);
            expect(res.body.data.tokens.accessToken).toBeDefined();
            expect(res.body.data.tokens.refreshToken).toBeDefined();
            expect(res.body.data.tokens.refreshToken).not.toBe(refreshToken);
        });

        it('treats a replayed (already-rotated) refresh token as theft and kills the session', async () => {
            await global.testUtils.createTestUser({
                phone: '5550000012',
                password: 'ReusePass!1',
                role: 'rider',
                profile: { name: 'Reuse Rider' }
            });
            const login = await request(app).post('/api/auth/login-phone').send({ phone: '5550000012', password: 'ReusePass!1' });
            const { refreshToken: original } = login.body.data.tokens;

            const first = await request(app).post('/api/auth/refresh').send({ refreshToken: original });
            expect(first.status).toBe(200);
            const rotated = first.body.data.tokens.refreshToken;

            // Replay the superseded token — should be rejected...
            const replay = await request(app).post('/api/auth/refresh').send({ refreshToken: original });
            expect(replay.status).toBe(401);

            // ...and the whole session should now be dead, including the
            // legitimately-rotated token that replaced it.
            const afterTheft = await request(app).post('/api/auth/refresh').send({ refreshToken: rotated });
            expect(afterTheft.status).toBe(401);
        });

        it('rejects an access token presented as a refresh token', async () => {
            await global.testUtils.createTestUser({
                phone: '5550000013',
                password: 'WrongType!1',
                role: 'rider',
                profile: { name: 'Wrong Type' }
            });
            const login = await request(app).post('/api/auth/login-phone').send({ phone: '5550000013', password: 'WrongType!1' });
            const { accessToken } = login.body.data.tokens;

            const res = await request(app).post('/api/auth/refresh').send({ refreshToken: accessToken });
            expect(res.status).toBe(401);
        });
    });
});
