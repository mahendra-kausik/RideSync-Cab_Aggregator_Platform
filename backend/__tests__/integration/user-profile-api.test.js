const request = require('supertest');
const mongoose = require('mongoose');
const createTestApp = require('../helpers/testApp');
const { OTP } = require('../../models');

// Regression for P-019: profile edits must go through the pre('save') PII
// encryption hook (fetch-then-.save()), not findByIdAndUpdate, which used to
// write profile.name/email/driverInfo PII as plaintext even though
// registration encrypts the same fields.
describe('User Profile API - PII encryption on update (Integration)', () => {
    let app;

    beforeAll(() => {
        app = createTestApp();
    });

    async function registerAndVerify(phone, extra = {}) {
        await request(app).post('/api/auth/register-phone').send({
            phone,
            profile: { name: 'Original Name' },
            role: 'rider',
            ...extra
        }).expect(200);
        const otpDoc = await OTP.findOne({ phone });
        const verify = await request(app).post('/api/auth/verify-otp')
            .send({ phone, otp: otpDoc.otp, password: 'Original#123' });
        expect(verify.status).toBe(201);
        return {
            token: verify.body.data.tokens.accessToken,
            userId: verify.body.data.user._id || verify.body.data.user.id
        };
    }

    it('encrypts profile.name at rest after PUT /users/profile, not just at registration', async () => {
        const { token, userId } = await registerAndVerify('5550002001');

        const res = await request(app)
            .put('/api/users/profile')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Updated Plain Name' });

        expect(res.status).toBe(200);
        expect(res.body.data.user.profile.name).toBe('Updated Plain Name');

        // Bypass Mongoose's decrypt hooks entirely - read the raw stored document.
        const raw = await mongoose.connection.collection('users')
            .findOne({ _id: new mongoose.Types.ObjectId(userId) });

        expect(raw.profile.name).not.toBe('Updated Plain Name');
        // ciphertext is hex(IV) + hex(authTag) + hex(data) => at least 64 hex chars
        expect(raw.profile.name.length).toBeGreaterThanOrEqual(64);
        expect(raw.profile.name).toMatch(/^[0-9a-f]+$/i);
    });

    it('encrypts driverInfo.licenseNumber at rest after PUT /users/driver/profile', async () => {
        const phone = '5550002002';
        await request(app).post('/api/auth/register-phone').send({
            phone,
            profile: { name: 'Driver Original' },
            role: 'driver',
            driverInfo: {
                licenseNumber: 'DL00000001',
                vehicleDetails: { make: 'Honda', model: 'Civic', plateNumber: 'ZZZ999', color: 'Red' }
            }
        }).expect(200);
        const otpDoc = await OTP.findOne({ phone });
        const verify = await request(app).post('/api/auth/verify-otp')
            .send({ phone, otp: otpDoc.otp, password: 'Original#123' });
        expect(verify.status).toBe(201);
        const token = verify.body.data.tokens.accessToken;
        const userId = verify.body.data.user._id || verify.body.data.user.id;

        const res = await request(app)
            .put('/api/users/driver/profile')
            .set('Authorization', `Bearer ${token}`)
            .send({ licenseNumber: 'DL99999999' });

        expect(res.status).toBe(200);
        expect(res.body.data.user.driverInfo.licenseNumber).toBe('DL99999999');

        const raw = await mongoose.connection.collection('users')
            .findOne({ _id: new mongoose.Types.ObjectId(userId) });

        expect(raw.driverInfo.licenseNumber).not.toBe('DL99999999');
        expect(raw.driverInfo.licenseNumber.length).toBeGreaterThanOrEqual(64);
    });
});
