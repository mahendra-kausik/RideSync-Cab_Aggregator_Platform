import { apiClient } from './apiClient';
import { ApiResponse, Ride } from '../types';

export interface FareEstimate {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  surgeFare: number;
  totalFare: number;
  distance: number;
  duration: number;
  surgeMultiplier: number;
}

export interface RideBookingRequest {
  pickup: {
    address: string;
    coordinates: {
      type: 'Point';
      coordinates: [number, number];
    };
  };
  destination: {
    address: string;
    coordinates: {
      type: 'Point';
      coordinates: [number, number];
    };
  };
}

class RideService {
  /**
   * Get fare estimate for a ride
   */
  async getFareEstimate(
    pickup: [number, number],
    destination: [number, number]
  ): Promise<FareEstimate> {
    try {
      const requestData = {
        pickup: {
          coordinates: pickup
        },
        destination: {
          coordinates: destination
        }
      };

      const response = await apiClient.post<ApiResponse<any>>('/rides/estimate', requestData);

      if (response.data.success && response.data.data) {
        const { distance, estimatedDuration, fare } = response.data.data;

        // Flatten the response to match the FareEstimate interface
        return {
          distance,
          duration: estimatedDuration,
          baseFare: fare.baseFare,
          distanceFare: fare.distanceFare,
          timeFare: fare.timeFare,
          surgeFare: fare.surgeFare || 0,
          totalFare: fare.totalFare,
          surgeMultiplier: fare.surgeMultiplier || 1.0
        };
      } else {
        throw new Error(response.data.error?.message || 'Failed to get fare estimate');
      }
    } catch (error: any) {
      console.error('Fare estimation error:', error);
      throw new Error(error.response?.data?.error?.message || 'Failed to estimate fare');
    }
  }

  /**
   * Book a new ride
   */
  async bookRide(rideData: RideBookingRequest): Promise<Ride> {
    try {
      const response = await apiClient.post<ApiResponse<{ ride: Ride; message: string }>>('/rides/book', rideData);

      if (response.data.success && response.data.data) {
        return (response.data.data as any).ride || (response.data.data as unknown as Ride);
      } else {
        throw new Error(response.data.error?.message || 'Failed to book ride');
      }
    } catch (error: any) {
      console.error('Ride booking error:', error);

      // Handle errors from axios interceptor (already transformed to ApiError)
      if (error.code && error.message) {
        console.error('API Error:', error.code, error.message);

        if (error.code === 'ACTIVE_RIDE_EXISTS') {
          throw new Error('You already have an active ride. Please complete or cancel it before booking a new one.');
        }

        throw new Error(error.message);
      }

      // Handle raw axios errors (backup)
      if (error.response?.data?.error) {
        const apiError = error.response.data.error;
        console.error('Raw API Error:', apiError.code, apiError.message);

        if (apiError.code === 'ACTIVE_RIDE_EXISTS') {
          throw new Error('You already have an active ride. Please complete or cancel it before booking a new one.');
        }

        throw new Error(apiError.message);
      }

      throw new Error('Failed to book ride');
    }
  }

  /**
   * Get ride details by ID
   */
  async getRideById(rideId: string): Promise<Ride> {
    try {
      const response = await apiClient.get<ApiResponse<{ ride: Ride }>>(`/rides/${rideId}`);

      if (response.data.success && response.data.data) {
        // Backend returns { ride: {...} }, extract the ride object
        return (response.data.data as any).ride || response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to get ride details');
      }
    } catch (error: any) {
      console.error('Get ride error:', error);
      throw new Error(error.response?.data?.error?.message || 'Failed to get ride details');
    }
  }

  /**
   * Get user's ride history
   */
  async getRideHistory(page = 1, limit = 10): Promise<{ rides: Ride[]; total: number; pages: number }> {
    try {
      const response = await apiClient.get<ApiResponse<{ rides: Ride[]; total: number; pages: number }>>('/rides/history', {
        params: { page, limit },
      });

      if (response.data.success && response.data.data) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to get ride history');
      }
    } catch (error: any) {
      console.error('Ride history error:', error);
      throw new Error(error.response?.data?.error?.message || 'Failed to get ride history');
    }
  }

  /**
   * Cancel a ride
   */
  async cancelRide(rideId: string, reason?: string): Promise<Ride> {
    try {
      // Backend cancels via status update endpoint
      const response = await apiClient.put<ApiResponse<{ ride: Ride; message: string }>>(`/rides/${rideId}/status`, {
        status: 'cancelled',
        reason,
      });

      if (response.data.success && response.data.data) {
        // The API returns { ride, message } – return the ride object
        return (response.data.data as any).ride || (response.data.data as unknown as Ride);
      } else {
        throw new Error(response.data.error?.message || 'Failed to cancel ride');
      }
    } catch (error: any) {
      console.error('Cancel ride error:', error);
      throw new Error(error.response?.data?.error?.message || 'Failed to cancel ride');
    }
  }

  /**
   * Rate a completed ride
   */
  async rateRide(rideId: string, rating: number, feedback?: string): Promise<Ride> {
    try {
      const response = await apiClient.put<ApiResponse<Ride>>(`/rides/${rideId}/rate`, {
        rating,
        feedback,
      });

      if (response.data.success && response.data.data) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to rate ride');
      }
    } catch (error: any) {
      console.error('Rate ride error:', error);
      throw new Error(error.response?.data?.error?.message || 'Failed to rate ride');
    }
  }

  // Driver-specific methods

  /**
   * Get pending ride requests for driver
   */
  async getPendingRides(location?: [number, number], radius = 10): Promise<Ride[]> {
    try {
      const params: any = { radius };
      if (location) {
        params.lat = location[1];
        params.lng = location[0];
      }

      const response = await apiClient.get<ApiResponse<any>>('/rides/driver/pending', {
        params,
      });

      console.log('🔍 getPendingRides response:', response.data);

      if (response.data.success && response.data.data) {
        // Backend returns { rides: [...], count: n, radius: x }
        if (response.data.data.rides && Array.isArray(response.data.data.rides)) {
          console.log('✅ Extracted rides:', response.data.data.rides);
          return response.data.data.rides;
        }
        // If backend ever returns array directly (legacy), handle that too
        if (Array.isArray(response.data.data)) {
          console.log('✅ Direct array:', response.data.data);
          return response.data.data;
        }
        // Otherwise, return empty array
        console.warn('⚠️ Unexpected data structure, returning empty array');
        return [];
      } else {
        throw new Error(response.data.error?.message || 'Failed to get pending rides');
      }
    } catch (error: any) {
      console.error('Get pending rides error:', error);
      // Return empty array instead of throwing to prevent UI crash
      return [];
    }
  }

  /**
   * Accept a ride request
   */
  async acceptRide(rideId: string): Promise<Ride> {
    try {
      const response = await apiClient.post<ApiResponse<{ ride: Ride; message: string }>>(`/rides/${rideId}/accept`);

      if (response.data.success && response.data.data) {
        return (response.data.data as any).ride || (response.data.data as unknown as Ride);
      } else {
        throw new Error(response.data.error?.message || 'Failed to accept ride');
      }
    } catch (error: any) {
      console.error('Accept ride error:', error);

      // apiClient's response interceptor already unwraps axios errors into a
      // flat { code, message } shape, so check that directly (not error.response).
      if (error.code === 'ASSIGNMENT_CONFLICT') {
        throw new Error('This ride has already been accepted by another driver or you are no longer available. Please refresh to see updated rides.');
      }

      throw new Error(error.message || 'Failed to accept ride');
    }
  }

  /**
   * Decline an offered ride
   */
  async declineRide(rideId: string): Promise<void> {
    try {
      const response = await apiClient.post<ApiResponse<{ message: string }>>(`/rides/${rideId}/decline`);

      if (!response.data.success) {
        throw new Error(response.data.error?.message || 'Failed to decline ride');
      }
    } catch (error: any) {
      console.error('Decline ride error:', error);

      if (error.code === 'ASSIGNMENT_CONFLICT') {
        throw new Error('This offer is no longer active - it may have already expired.');
      }

      throw new Error(error.message || 'Failed to decline ride');
    }
  }

  /**
   * Update ride status
   */
  async updateRideStatus(rideId: string, status: Ride['status']): Promise<Ride> {
    try {
      const response = await apiClient.put<ApiResponse<{ ride: Ride; message: string }>>(`/rides/${rideId}/status`, {
        status,
      });

      if (response.data.success && response.data.data) {
        return (response.data.data as any).ride || (response.data.data as unknown as Ride);
      } else {
        throw new Error(response.data.error?.message || 'Failed to update ride status');
      }
    } catch (error: any) {
      console.error('Update ride status error:', error);

      // apiClient's response interceptor already unwraps axios errors into a
      // flat { code, message } shape, so check that directly (not error.response).
      if (error.code === 'STATUS_UPDATE_CONFLICT') {
        throw new Error('This ride was already updated by another request. Refresh to see its current status.');
      }

      throw new Error(error.message || 'Failed to update ride status');
    }
  }

  /**
   * Complete a ride (driver only)
   */
  async completeRide(rideId: string, actualDistance?: number, actualDuration?: number): Promise<Ride> {
    try {
      const response = await apiClient.put<ApiResponse<Ride>>(`/rides/${rideId}/complete`, {
        actualDistance,
        actualDuration,
      });

      if (response.data.success && response.data.data) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to complete ride');
      }
    } catch (error: any) {
      console.error('Complete ride error:', error);
      throw new Error(error.response?.data?.error?.message || 'Failed to complete ride');
    }
  }
}

export const rideService = new RideService();