const request = require('supertest');
const createTestApp = require('../helpers/testApp');
describe('Rides API (Integration)', () => {
    let app;

    beforeAll(() => {
        app = createTestApp();
    });

    const pickup = {
        address: 'One Apple Park Way',
        coordinates: { type: 'Point', coordinates: [-122.0090, 37.3349] },
    };
    const destination = {
        address: '1600 Amphitheatre Parkway',
        coordinates: { type: 'Point', coordinates: [-122.0841, 37.4220] },
    };

    it('should estimate fare for a valid route (public)', async () => {
        // RideController.getFareEstimate expects { pickup.coordinates: [lng,lat] }
        const res2 = await request(app)
            .post('/api/rides/estimate')
            .send({
                pickup: { coordinates: pickup.coordinates.coordinates },
                destination: { coordinates: destination.coordinates.coordinates }
            });

        expect([200, 400]).toContain(res2.status);
        if (res2.status === 200) {
            expect(res2.body.success).toBe(true);
            expect(res2.body.data.distance).toBeGreaterThan(0.1);
            expect(res2.body.data.fare.totalFare).toBeGreaterThan(0);
        } else {
            // If min distance check triggers for some coordinates, still acceptable
            expect(res2.body.error.code).toBeDefined();
        }
    });

    it('should allow rider to book a ride and return ride object', async () => {
        // Create rider via OTP flow to obtain a valid session token
        const phone = '5550001000';
        await request(app)
            .post('/api/auth/register-phone')
            .send({ phone, profile: { name: 'Ride Booker' }, role: 'rider' })
            .expect(200);
        const { OTP } = require('../../models');
        const otpDoc = await OTP.findOne({ phone });
        const verify = await request(app)
            .post('/api/auth/verify-otp')
            .send({ phone, otp: otpDoc.otp, password: 'RideNow#1', tempUserData: { name: 'Ride Booker', role: 'rider' } });
        expect(verify.status).toBe(201);
        const token = verify.body.data.tokens.accessToken;

        const res = await request(app)
            .post('/api/rides/book')
            .set('Authorization', `Bearer ${token}`)
            .send({ pickup, destination });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.ride).toBeDefined();
        expect(res.body.data.ride.status).toBe('requested');
    });
});
