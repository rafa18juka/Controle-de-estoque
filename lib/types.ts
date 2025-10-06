export type UserRole = "admin" | "staff";

export interface AppUser {
  uid: string;
  email: string;
  displayName?: string | null;
  role: UserRole;
}

// KIT-SKU START
export interface ProductKit {
  sku: string;
  multiplier: number;
  label: string;
}
// KIT-SKU END

export interface Product {
  id: string;
  name: string;
  sku: string;
  unitPrice: number;
  category?: string;
  supplier?: string;
  quantity: number;
  // KIT-SKU START
  kits?: ProductKit[];
  kitSkus?: string[];
  // KIT-SKU END
  totalValue: number;
  estoqueMinimo?: number;
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
  unitPrice?: number;
  totalValue?: number;
  // KIT-SKU START
  parentSku?: string;
  scannedSku?: string;
  multiplier?: number;
  effectiveQty?: number;
  // KIT-SKU END
}

export interface TrackingCodeProductLink {
  sku: string;
  name?: string;
  quantity?: number;
  scannedSku?: string;
}

export interface TrackingCodeRecord {
  id: string;
  code: string;
  userId: string;
  userName: string;
  createdAt: number;
  productSku?: string;
  productName?: string;
  stockMovementId?: string;
  products?: TrackingCodeProductLink[];
}

export interface Category {
  id: string;
  name: string;
}

export interface Supplier {
  id: string;
  name: string;
}
