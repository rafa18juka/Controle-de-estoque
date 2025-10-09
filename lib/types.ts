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

export type TaskOptionType = "task" | "platform" | "account";

export interface TaskOption {
  id: string;
  type: TaskOptionType;
  name: string;
  color: string;
}

export type TaskStatus = "pending" | "completed" | "archived";

export interface TaskAssignment {
  id: string;
  taskOptionId?: string;
  taskLabel: string;
  taskColor?: string;
  platformId?: string;
  platformLabel?: string;
  platformColor?: string;
  accountId?: string;
  accountLabel?: string;
  accountColor?: string;
  productId?: string;
  productSku?: string;
  productName?: string;
  userId: string;
  userName: string;
  assignedById: string;
  assignedByName: string;
  status: TaskStatus;
  notes?: string;
  dueDate?: number;
  createdAt: number;
  updatedAt?: number;
  completedAt?: number;
}
