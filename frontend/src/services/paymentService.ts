import { apiClient } from './apiClient';
import { ApiResponse, Ride } from '../types';

export interface PaymentRequest {
  rideId: string;
  paymentMethod: 'mock' | 'cash';
  paymentDetails?: {
    cardNumber?: string;
    cvv?: string;
    expiryMonth?: number;
    expiryYear?: number;
  };
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
   * Validate payment method details
   */
  validatePaymentDetails(method: string, details?: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    switch (method) {
      case 'mock':
        if (details?.cardNumber && !/^\d{16}$/.test(details.cardNumber.replace(/\s/g, ''))) {
          errors.push('Card number must be 16 digits');
        }
        if (details?.cvv && !/^\d{3,4}$/.test(details.cvv)) {
          errors.push('CVV must be 3 or 4 digits');
        }
        if (details?.expiryMonth && (details.expiryMonth < 1 || details.expiryMonth > 12)) {
          errors.push('Expiry month must be between 1 and 12');
        }
        if (details?.expiryYear && details.expiryYear < new Date().getFullYear()) {
          errors.push('Expiry year cannot be in the past');
        }
        break;

      case 'cash':
        // No validation needed for cash payments
        break;

      default:
        errors.push('Invalid payment method');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
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

  /**
   * Get mock payment test scenarios
   */
  getMockPaymentScenarios(): Array<{ cardNumber: string; description: string; expectedResult: string }> {
    return [
      {
        cardNumber: '4242424242424242',
        description: 'Successful payment',
        expectedResult: 'Payment will be processed successfully'
      },
      {
        cardNumber: '4000000000000002',
        description: 'Card declined',
        expectedResult: 'Payment will be declined'
      },
      {
        cardNumber: '4000000000009995',
        description: 'Insufficient funds',
        expectedResult: 'Payment will fail due to insufficient funds'
      }
    ];
  }
}

export const paymentService = new PaymentService();