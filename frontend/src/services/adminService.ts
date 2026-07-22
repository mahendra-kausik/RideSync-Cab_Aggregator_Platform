import { apiClient } from './apiClient';

export interface User {
  _id: string;
  phone?: string;
  email?: string;
  role: 'rider' | 'driver' | 'admin';
  profile: {
    name: string;
    avatar?: string;
    rating: number;
    totalRides: number;
  };
  driverInfo?: {
    licenseNumber: string;
    vehicleDetails: {
      make: string;
      model: string;
      plateNumber: string;
      color: string;
      year?: number;
    };
    isAvailable: boolean;
    currentLocation?: {
      type: 'Point';
      coordinates: [number, number];
    };
  };
  isActive: boolean;
  isVerified: boolean;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserStats {
  totalRides: number;
  completedRides: number;
  cancelledRides: number;
  totalEarnings: number;
}

export interface Ride {
  _id: string;
  riderId: {
    _id: string;
    profile: { name: string };
    phone?: string;
    role: string;
  };
  driverId?: {
    _id: string;
    profile: { name: string };
    phone?: string;
    role: string;
    driverInfo?: {
      vehicleDetails: {
        make: string;
        model: string;
        plateNumber: string;
        color: string;
      };
    };
  };
  status: 'requested' | 'matched' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
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
  fare: {
    estimated: number;
    final?: number;
    breakdown: {
      baseFare: number;
      distanceFare: number;
      timeFare: number;
      surgeFare: number;
    };
  };
  timeline: {
    requestedAt: string;
    matchedAt?: string;
    acceptedAt?: string;
    startedAt?: string;
    completedAt?: string;
    cancelledAt?: string;
  };
  payment: {
    method: string;
    status: string;
    transactionId?: string;
  };
  rating?: {
    driverRating?: number;
    riderRating?: number;
    driverFeedback?: string;
    riderFeedback?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PlatformStats {
  users: {
    total: number;
    riders: number;
    drivers: number;
    admins: number;
    activeUsers: number;
    activeDrivers: number;
  };
  rides: {
    total: number;
    requested: number;
    matched: number;
    accepted: number;
    inProgress: number;
    completed: number;
    cancelled: number;
  };
  revenue: {
    totalRevenue: number;
    totalDriverEarnings: number;
    totalRides: number;
    averageFare: number;
  };
  today: {
    rides: number;
    completed: number;
    cancelled: number;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

class AdminService {
  // User management
  async getAllUsers(params?: {
    page?: number;
    limit?: number;
    role?: string;
    status?: string;
    search?: string;
  }): Promise<PaginatedResponse<User>> {
    const queryParams = new URLSearchParams();
    if (params?.page) {
      queryParams.append('page', params.page.toString());
    }
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }
    if (params?.role) {
      queryParams.append('role', params.role);
    }
    if (params?.status) {
      queryParams.append('status', params.status);
    }
    if (params?.search) {
      queryParams.append('search', params.search);
    }

    const response = await apiClient.get(`/users/admin/users?${queryParams}`);
    return {
      data: response.data.data,
      pagination: response.data.pagination
    };
  }

  async getUserById(userId: string): Promise<{ user: User; stats: UserStats }> {
    const response = await apiClient.get(`/users/admin/users/${userId}`);
    return response.data.data;
  }

  async suspendUser(userId: string, reason?: string): Promise<void> {
    await apiClient.put(`/users/admin/users/${userId}/suspend`, { reason });
  }

  async reactivateUser(userId: string, reason?: string): Promise<void> {
    await apiClient.put(`/users/admin/users/${userId}/reactivate`, { reason });
  }

  // Platform statistics
  async getPlatformStats(): Promise<PlatformStats> {
    const response = await apiClient.get('/users/admin/stats');
    return response.data.data;
  }

  // Ride management
  async getAllRides(params?: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<PaginatedResponse<Ride>> {
    const queryParams = new URLSearchParams();
    if (params?.page) {
      queryParams.append('page', params.page.toString());
    }
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }
    if (params?.status) {
      queryParams.append('status', params.status);
    }
    if (params?.search) {
      queryParams.append('search', params.search);
    }
    if (params?.startDate) {
      queryParams.append('startDate', params.startDate);
    }
    if (params?.endDate) {
      queryParams.append('endDate', params.endDate);
    }

    const response = await apiClient.get(`/users/admin/rides?${queryParams}`);
    return {
      data: response.data.data,
      pagination: response.data.pagination
    };
  }
}

export default new AdminService();