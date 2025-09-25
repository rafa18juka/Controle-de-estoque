export type UserRole = "admin" | "staff";

export interface AppUser {
  uid: string;
  email: string;
  displayName?: string | null;
  role: UserRole;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  unitPrice: number;
  category?: string;
  supplier?: string;
  quantity: number;
  totalValue: number;
}

export interface StockMovement {
  id: string;
  productId: string;
  sku: string;
  qty: number;
  type: "out" | "in";
  userId: string;
  userName: string;
  timestamp: number;
}

export interface Category {
  id: string;
  name: string;
}

export interface Supplier {
  id: string;
  name: string;
}
