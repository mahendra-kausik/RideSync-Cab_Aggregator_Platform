/**
 * UNIT TESTS for SocketService driver presence (disconnect grace period)
 *
 * A driver's socket can drop and reconnect for reasons unrelated to actually
 * going offline (network blip, a frontend re-render tearing the socket down
 * and recreating it - see SocketContext.tsx). handleDisconnection must not
 * wipe driverInfo.isAvailable immediately; only after a grace period with no
 * reconnect. A reconnect within that window (handleConnection) must cancel
 * the pending wipe.
 *
 * Characteristics:
 * - Fast execution via fake timers (no real 30s wait)
 * - Mocked User model
 * - Uses the real presence.driverDisconnectGraceMs from config/security
 */

jest.mock('../../models', () => ({
    User: {
        findByIdAndUpdate: jest.fn().mockResolvedValue({})
    },
    Ride: {}
}));

const { User } = require('../../models');
const { presence } = require('../../config/security');
const socketService = require('../../services/socketService');

const makeSocket = (id, userId, userRole) => ({
    id,
    userId,
    userRole,
    emit: jest.fn(),
    on: jest.fn()
});

describe('SocketService - driver disconnect grace period', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // socketService is a singleton - clear presence state left over from
        // other tests/files sharing the module registry.
        socketService.connectedUsers.clear();
        socketService.userSockets.clear();
        socketService.pendingAvailabilityWipes.forEach(timer => clearTimeout(timer));
        socketService.pendingAvailabilityWipes.clear();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('does not wipe availability if the driver reconnects within the grace period', () => {
        const driverId = 'driver-reconnects';
        const firstSocket = makeSocket('socket-a', driverId, 'driver');
        socketService.handleConnection(firstSocket);

        socketService.handleDisconnection(firstSocket, 'transport close');
        expect(User.findByIdAndUpdate).not.toHaveBeenCalled();

        // Reconnect well within the grace window
        jest.advanceTimersByTime(1000);
        const secondSocket = makeSocket('socket-b', driverId, 'driver');
        socketService.handleConnection(secondSocket);

        // Let the original wipe's scheduled time fully elapse
        jest.advanceTimersByTime(presence.driverDisconnectGraceMs);
        expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('wipes availability once the grace period elapses with no reconnect', () => {
        const driverId = 'driver-stays-gone';
        const socket = makeSocket('socket-c', driverId, 'driver');
        socketService.handleConnection(socket);

        socketService.handleDisconnection(socket, 'transport close');
        expect(User.findByIdAndUpdate).not.toHaveBeenCalled();

        jest.advanceTimersByTime(presence.driverDisconnectGraceMs + 1000);
        expect(User.findByIdAndUpdate).toHaveBeenCalledWith(driverId, { 'driverInfo.isAvailable': false });
    });

    it('does not schedule a wipe for a non-driver disconnect', () => {
        const riderId = 'rider-1';
        const socket = makeSocket('socket-d', riderId, 'rider');
        socketService.handleConnection(socket);

        socketService.handleDisconnection(socket, 'transport close');
        jest.advanceTimersByTime(presence.driverDisconnectGraceMs + 1000);

        expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });
});
