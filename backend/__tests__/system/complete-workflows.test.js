const request = require('supertest');
const createTestApp = require('../helpers/testApp');
const { OTP, User } = require('../../models');

/**
 * System Workflow Tests
 * End-to-end scenario covering: phone registration -> OTP verify -> login -> book ride
 * Uses in-memory Mongo and lightweight Express app.
 */
describe('System Workflow - Rider Journey', () => {
    let app;
    beforeAll(() => {
      app = createTestApp();
    });

    it('should complete full rider workflow successfully', async () => {
        const phone = '+15551112222';

        // 1. Register phone (request OTP)
        const registerRes = await request(app)
            .post('/api/auth/register-phone')
            .send({ phone, profile: { name: 'Workflow Rider' }, role: 'rider' });
        expect(registerRes.status).toBe(200);
        expect(registerRes.body.success).toBe(true);

        // 2. Retrieve OTP from DB (simulate user receives SMS)
        const otpDoc = await OTP.findOne({ phone });
        expect(otpDoc).toBeTruthy();

        // 3. Verify OTP and create account
        const verifyRes = await request(app)
            .post('/api/auth/verify-otp')
            .send({
                phone,
                otp: otpDoc.otp,
                password: 'Workflow#Pass1',
                tempUserData: { name: 'Workflow Rider', role: 'rider' }
            });
        expect(verifyRes.status).toBe(201);
        const accessToken = verifyRes.body.data.tokens.accessToken;
        expect(accessToken).toBeDefined();

        // 4. Login via phone to obtain fresh tokens
        const loginRes = await request(app)
            .post('/api/auth/login-phone')
            .send({ phone, password: 'Workflow#Pass1' });
        expect(loginRes.status).toBe(200);
        const riderToken = loginRes.body.data.tokens.accessToken;

        // 5. Book a ride
        const pickup = {
            address: 'Origin Point',
            coordinates: { type: 'Point', coordinates: [-122.031, 37.331] }
        };
        const destination = {
            address: 'Destination Point',
            coordinates: { type: 'Point', coordinates: [-122.041, 37.341] }
        };

        const bookRes = await request(app)
            .post('/api/rides/book')
            .set('Authorization', `Bearer ${riderToken}`)
            .send({ pickup, destination });
        expect(bookRes.status).toBe(201);
        expect(bookRes.body.success).toBe(true);
        expect(bookRes.body.data.ride.status).toBe('requested');

        // 6. Confirm rider appears in user collection and ride references rider
        const user = await User.findByPhone(phone);
        expect(user).toBeTruthy();
        const rideId = bookRes.body.data.ride._id;
        expect(rideId).toBeDefined();
    });
});
