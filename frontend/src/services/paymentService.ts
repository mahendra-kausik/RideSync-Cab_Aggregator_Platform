import { apiClient } from './apiClient';
import { ApiResponse, Ride } from '../types';

export interface PaymentRequest {
  rideId: string;
  paymentMethod: 'cash';
}

export interface RatingRequest {
  rideId: string;
  rating: number;
  feedback?: string;
  ratingType: 'driver' | 'rider';
}

export interface Receipt {
  receiptId: string;
  rideId: string;
  date: string;
  rider: {
    name: string;
    phone: string;
  };
  driver: {
    name: string;
    vehicle: string;
    plateNumber: string;
  } | null;
  trip: {
    pickup: string;
    destination: string;
    distance: number;
    duration: number;
    startTime: string;
    endTime: string;
  };
  fare: {
    baseFare: number;
    distanceFare: number;
    timeFare: number;
    surgeFare: number;
    total: number;
  };
  payment: {
    method: string;
    transactionId: string;
    status: string;
  };
}

export interface PaymentHistoryResponse {
  payments: Ride[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalPayments: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

class PaymentService {
  /**
   * Process payment for a completed ride
   */
  async processPayment(paymentData: PaymentRequest): Promise<{ ride: Ride; receipt: Receipt; transactionId: string }> {
    try {
      const response = await apiClient.post<ApiResponse<{ ride: Ride; receipt: Receipt; transactionId: string }>>('/payments/process', paymentData);

      if (response.data.success && response.data.data) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to process payment');
      }
    } catch (error: any) {
      console.error('Payment processing error:', error);
      throw new Error(error.response?.data?.error?.message || 'Failed to process payment');
    }
  }

  /**
   * Submit rating for a completed ride
   */
  async submitRating(ratingData: RatingRequest): Promise<Ride> {
    try {
      console.log('📤 Submitting rating:', ratingData);
      const response = await apiClient.post<ApiResponse<{ ride: Ride }>>('/payments/rate', ratingData);

      if (response.data.success && response.data.data) {
        return response.data.data.ride;
      } else {
        throw new Error(response.data.error?.message || 'Failed to submit rating');
      }
    } catch (error: any) {
      console.error('Rating submission error:', error);
      console.error('Error response:', error.response?.data);
      throw new Error(error.response?.data?.error?.message || error.message || 'Failed to submit rating');
    }
  }

  /**
   * Get payment history for the user
   */
  async getPaymentHistory(page = 1, limit = 10, status?: string): Promise<PaymentHistoryResponse> {
    try {
      const params: any = { page, limit };
      if (status) {
        params.status = status;
      }

      const response = await apiClient.get<ApiResponse<PaymentHistoryResponse>>('/payments/history', { params });

      if (response.data.success && response.data.data) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to get payment history');
      }
    } catch (error: any) {
      console.error('Payment history error:', error);
      throw new Error(error.response?.data?.error?.message || 'Failed to get payment history');
    }
  }

  /**
   * Get receipt for a specific ride
   */
  async getReceipt(rideId: string): Promise<Receipt> {
    try {
      const response = await apiClient.get<ApiResponse<{ receipt: Receipt }>>(`/payments/receipt/${rideId}`);

      if (response.data.success && response.data.data) {
        return response.data.data.receipt;
      } else {
        throw new Error(response.data.error?.message || 'Failed to get receipt');
      }
    } catch (error: any) {
      console.error('Get receipt error:', error);
      throw new Error(error.response?.data?.error?.message || 'Failed to get receipt');
    }
  }

  /**
   * Format currency amount
   */
  formatCurrency(amount: number, currency = 'INR'): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  /**
   * Format receipt for display
   */
  formatReceiptForDisplay(receipt: Receipt): string {
    const lines = [
      '='.repeat(40),
      '           RIDE RECEIPT',
      '='.repeat(40),
      `Receipt ID: ${receipt.receiptId}`,
      `Date: ${new Date(receipt.date).toLocaleString()}`,
      '',
      'TRIP DETAILS:',
      '-'.repeat(20),
      `From: ${receipt.trip.pickup}`,
      `To: ${receipt.trip.destination}`,
      `Distance: ${receipt.trip.distance.toFixed(2)} km`,
      `Duration: ${Math.round(receipt.trip.duration)} minutes`,
      '',
      'RIDER:',
      '-'.repeat(20),
      `Name: ${receipt.rider.name}`,
      `Phone: ${receipt.rider.phone}`,
      '',
    ];

    if (receipt.driver) {
      lines.push(
        'DRIVER:',
        '-'.repeat(20),
        `Name: ${receipt.driver.name}`,
        `Vehicle: ${receipt.driver.vehicle}`,
        `Plate: ${receipt.driver.plateNumber}`,
        ''
      );
    }

    lines.push(
      'FARE BREAKDOWN:',
      '-'.repeat(20),
      `Base Fare: ${this.formatCurrency(receipt.fare.baseFare)}`,
      `Distance Fare: ${this.formatCurrency(receipt.fare.distanceFare)}`,
      `Time Fare: ${this.formatCurrency(receipt.fare.timeFare)}`,
      `Surge Fare: ${this.formatCurrency(receipt.fare.surgeFare)}`,
      '-'.repeat(20),
      `TOTAL: ${this.formatCurrency(receipt.fare.total)}`,
      '',
      'PAYMENT:',
      '-'.repeat(20),
      `Method: ${receipt.payment.method.toUpperCase()}`,
      `Transaction ID: ${receipt.payment.transactionId}`,
      `Status: ${receipt.payment.status.toUpperCase()}`,
      '',
      '='.repeat(40),
      '     Thank you for riding with us!',
      '='.repeat(40)
    );

    return lines.join('\n');
  }
}

export const paymentService = new PaymentService();