export type Role = 'customer' | 'operator' | 'admin';
export interface SessionUser { id: string; name: string; email: string; role: Role; }
export interface ApiEnvelope<T> { data: T; pagination?: { page: number; limit: number; total: number } }
