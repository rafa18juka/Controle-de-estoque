import type {
  Product,
  ProductKit,
  StockMovement,
  TaskAssignment,
  TaskOption,
  TaskOptionType,
  TaskStatus,
  TrackingCodeRecord
} from "./types";
import { ensureFirebase } from "./firebase-client";

export interface StockOutInput {
  sku: string;
  qty: number;
  userId: string;
  userName: string;
}

export interface StockOutResult {
  product: Product;
  // KIT-SKU START
  kit: ProductKit | null;
  effectiveQty: number;
  scannedSku: string;
  // KIT-SKU END
}

// KIT-SKU START
export interface ResolvedSkuResult {
  product: Product;
  kit: ProductKit | null;
  sanitizedSku: string;
}

function normalizeKits(raw: any): ProductKit[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const sku = typeof item.sku === "string" ? item.sku.trim() : "";
      if (!sku) {
        return null;
      }
      const label = typeof item.label === "string" ? item.label.trim() : "";
      const rawMultiplier = Number(item.multiplier ?? 1);
      const multiplier = Number.isFinite(rawMultiplier) ? Math.max(1, Math.floor(rawMultiplier)) : 1;
      return {
        sku,
        label,
        multiplier
      } satisfies ProductKit;
    })
    .filter((kit): kit is ProductKit => Boolean(kit));
}

function normalizeKitSkus(raw: any): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
}

export function mapProductDoc(doc: any): Product {
  const data = doc.data() ?? {};
  const kits = normalizeKits(data.kits);
  const kitSkus = normalizeKitSkus(data.kitSkus);
  const product: Product = {
    id: doc.id,
    name: typeof data.name === "string" ? data.name : "",
    sku: typeof data.sku === "string" ? data.sku : "",
    unitPrice: Number(data.unitPrice ?? 0),
    category: typeof data.category === "string" && data.category.length ? data.category : undefined,
    supplier: typeof data.supplier === "string" && data.supplier.length ? data.supplier : undefined,
    quantity: Number(data.quantity ?? 0),
    totalValue: Number(data.totalValue ?? 0),
    estoqueMinimo: typeof data.estoqueMinimo === "number" ? data.estoqueMinimo : undefined
  };
  if (kits.length) {
    product.kits = kits;
  }
  if (kitSkus.length) {
    product.kitSkus = kitSkus;
  }
  return product;
}

export async function resolveSkuToParentAndMultiplier(
  sku: string,
  existingBundle?: any
): Promise<ResolvedSkuResult | null> {
  const sanitizedSku = typeof sku === "string" ? sku.trim() : "";
  if (!sanitizedSku) {
    return null;
  }

  const bundle = existingBundle ?? (await ensureFirebase());
  const { firestore, db } = bundle;
  const productsRef = firestore.collection(db, "products");

  const parentQuery = firestore.query(
    productsRef,
    firestore.where("sku", "==", sanitizedSku),
    firestore.limit(1)
  );
  const parentSnapshot = await firestore.getDocs(parentQuery);
  if (!parentSnapshot.empty) {
    const doc = parentSnapshot.docs[0];
    return {
      product: mapProductDoc(doc),
      kit: null,
      sanitizedSku
    };
  }

  const kitQuery = firestore.query(
    productsRef,
    firestore.where("kitSkus", "array-contains", sanitizedSku),
    firestore.limit(1)
  );
  const kitSnapshot = await firestore.getDocs(kitQuery);
  if (kitSnapshot.empty) {
    return null;
  }

  const doc = kitSnapshot.docs[0];
  const product = mapProductDoc(doc);
  const kit = (product.kits ?? []).find((item) => item.sku === sanitizedSku) ?? null;
  if (!kit) {
    return null;
  }

  return {
    product,
    kit,
    sanitizedSku
  };
}
// KIT-SKU END

export async function getProductBySku(sku: string): Promise<Product | null> {
  const resolved = await resolveSkuToParentAndMultiplier(sku);
  return resolved ? resolved.product : null;
}


export async function processStockOut(input: StockOutInput): Promise<StockOutResult> {
  const { sku, qty, userId, userName } = input;
  if (!userId) {
    throw new Error("Usuario nao autenticado.");
  }

  const numericQty = Number(qty);
  if (!Number.isFinite(numericQty) || numericQty <= 0) {
    throw new Error("Informe uma quantidade valida.");
  }

  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;

  const resolved = await resolveSkuToParentAndMultiplier(sku, bundle);
  if (!resolved) {
    throw new Error("Produto nao encontrado para este SKU.");
  }

  const { product, kit, sanitizedSku } = resolved;
  const baseQty = Math.max(1, Math.floor(numericQty));
  const multiplier = kit?.multiplier ?? 1;
  const effectiveQty = baseQty * multiplier;

  if (effectiveQty <= 0) {
    throw new Error("Informe uma quantidade valida.");
  }

  const productRef = firestore.doc(db, "products", product.id);

  let updatedProduct: Product | null = null;

  await firestore.runTransaction(db, async (transaction: any) => {
    const snapshot = await transaction.get(productRef);
    if (!snapshot.exists()) {
      throw new Error("Produto nao encontrado.");
    }

    const data = snapshot.data();
    const currentQuantity = Number(data.quantity ?? 0);
    const unitPrice = Number(data.unitPrice ?? 0);

    if (currentQuantity < effectiveQty) {
      throw new Error("Estoque insuficiente para essa saida.");
    }

    const newQuantity = currentQuantity - effectiveQty;
    const newTotalValue = Number((newQuantity * unitPrice).toFixed(2));
    const movementUnitPrice = Number.isFinite(unitPrice) ? Number(unitPrice.toFixed(2)) : 0;
    const movementTotalValue = Number((effectiveQty * movementUnitPrice).toFixed(2));

    transaction.update(productRef, {
      quantity: newQuantity,
      totalValue: newTotalValue
    });

    const movementsRef = firestore.collection(db, "stockMovements");
    const movementRef = firestore.doc(movementsRef);

    transaction.set(movementRef, {
      id: movementRef.id,
      productId: productRef.id,
      sku: product.sku,
      qty: effectiveQty,
      type: "out",
      userId,
      userName: userName || "desconhecido",
      timestamp: firestore.serverTimestamp(),
      unitPrice: movementUnitPrice,
      totalValue: movementTotalValue,
      // KIT-SKU START
      parentSku: product.sku,
      scannedSku: sanitizedSku,
      multiplier,
      effectiveQty
      // KIT-SKU END
    });

    const kits = normalizeKits(data.kits);
    const kitSkus = normalizeKitSkus(data.kitSkus);

    const nextProduct: Product = {
      id: productRef.id,
      name: typeof data.name === "string" ? data.name : "",
      sku: typeof data.sku === "string" ? data.sku : "",
      unitPrice,
      category: typeof data.category === "string" && data.category.length ? data.category : undefined,
      supplier: typeof data.supplier === "string" && data.supplier.length ? data.supplier : undefined,
      quantity: newQuantity,
      totalValue: newTotalValue,
      estoqueMinimo: typeof data.estoqueMinimo === "number" ? data.estoqueMinimo : undefined
    };

    if (kits.length) {
      nextProduct.kits = kits;
    }

    if (kitSkus.length) {
      nextProduct.kitSkus = kitSkus;
    }

    updatedProduct = nextProduct;
  });

  if (!updatedProduct) {
    throw new Error("Falha ao atualizar o produto.");
  }

  return {
    product: updatedProduct,
    kit,
    effectiveQty,
    scannedSku: sanitizedSku
  };
}

export interface StockMovementsFilters {
  limit?: number;
  startAfter?: any;
  sku?: string;
  scannedSku?: string;
  userId?: string;
  type?: "out" | "in";
  range?: { start?: Date | null; end?: Date | null };
}

export interface StockMovementWithProduct extends StockMovement {
  productName?: string;
}

export interface StockMovementsPage {
  movements: StockMovementWithProduct[];
  nextCursor: any;
}

export async function fetchStockMovements(filters: StockMovementsFilters): Promise<StockMovementsPage> {
  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;
  const ref = firestore.collection(db, "stockMovements");
  const constraints: any[] = [];
  if (filters.type) {
    constraints.push(firestore.where("type", "==", filters.type));
  }
  const sanitizedSku = typeof filters.sku === "string" ? filters.sku.trim() : "";
  if (sanitizedSku) {
    constraints.push(firestore.where("sku", "==", sanitizedSku));
  }
  const sanitizedScannedSku = typeof filters.scannedSku === "string" ? filters.scannedSku.trim() : "";
  if (sanitizedScannedSku) {
    constraints.push(firestore.where("scannedSku", "==", sanitizedScannedSku));
  }
  if (filters.userId) {
    constraints.push(firestore.where("userId", "==", filters.userId));
  }
  if (filters.range?.start) {
    constraints.push(
      firestore.where("timestamp", ">=", firestore.Timestamp.fromDate(filters.range.start))
    );
  }
  if (filters.range?.end) {
    constraints.push(
      firestore.where("timestamp", "<=", firestore.Timestamp.fromDate(filters.range.end))
    );
  }
  constraints.push(firestore.orderBy("timestamp", "desc"));
  const pageLimit = filters.limit ?? 25;
  if (filters.startAfter) {
    constraints.push(firestore.startAfter(filters.startAfter));
  }
  constraints.push(firestore.limit(pageLimit));
  const query = firestore.query(ref, ...constraints);
  const snapshot = await firestore.getDocs(query);

  const movements: StockMovementWithProduct[] = snapshot.docs.map((doc: any) => {
    const data = doc.data();
    const timestampValue = data.timestamp && typeof data.timestamp.toMillis === "function"
      ? data.timestamp.toMillis()
      : Number(data.timestamp ?? 0);
    const movement: StockMovementWithProduct = {
      id: doc.id,
      productId: typeof data.productId === "string" ? data.productId : "",
      sku: typeof data.sku === "string" ? data.sku : "",
      qty: Number(data.qty ?? 0),
      type: typeof data.type === "string" ? data.type : "out",
      userId: typeof data.userId === "string" ? data.userId : "",
      userName: typeof data.userName === "string" ? data.userName : "",
      timestamp: timestampValue,
      parentSku: typeof data.parentSku === "string" ? data.parentSku : undefined,
      scannedSku: typeof data.scannedSku === "string" ? data.scannedSku : undefined,
      multiplier: typeof data.multiplier === "number" ? data.multiplier : undefined,
      effectiveQty: typeof data.effectiveQty === "number" ? data.effectiveQty : undefined
    };
    const rawUnitPrice = Number(data.unitPrice);
    if (Number.isFinite(rawUnitPrice)) {
      movement.unitPrice = Number(rawUnitPrice.toFixed(2));
    }
    const rawTotalValue = Number(data.totalValue);
    if (Number.isFinite(rawTotalValue)) {
      movement.totalValue = Number(Math.abs(rawTotalValue).toFixed(2));
    }
    return movement;
  });

  const productIds = Array.from(
    new Set(
      movements
        .map((movement) => movement.productId)
        .filter((id): id is string => Boolean(id))
    )
  );

  const productDetails = await loadProductSummaries(productIds);

  const enriched = movements.map((movement) => {
    const details = productDetails.get(movement.productId ?? "");
    const enrichedMovement: StockMovementWithProduct = {
      ...movement,
      productName: details?.name ?? ""
    };

    if (enrichedMovement.unitPrice === undefined && details?.unitPrice !== undefined) {
      enrichedMovement.unitPrice = Number(details.unitPrice.toFixed(2));
    }

    if (
      (enrichedMovement.totalValue === undefined || enrichedMovement.totalValue === 0) &&
      enrichedMovement.unitPrice !== undefined
    ) {
      const quantityForValue = Math.abs(Number(enrichedMovement.effectiveQty ?? enrichedMovement.qty ?? 0));
      const computedTotal = Number((quantityForValue * enrichedMovement.unitPrice).toFixed(2));
      if (computedTotal > 0) {
        enrichedMovement.totalValue = computedTotal;
      }
    }

    return enrichedMovement;
  });

  const nextCursor = snapshot.docs.length === pageLimit ? snapshot.docs[snapshot.docs.length - 1] : null;

  return { movements: enriched, nextCursor };
}

export async function deleteStockMovement(movementId: string): Promise<void> {
  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;
  const movementRef = firestore.doc(db, "stockMovements", movementId);
  await firestore.runTransaction(db, async (transaction: any) => {
    const snapshot = await transaction.get(movementRef);
    if (!snapshot.exists()) {
      throw new Error("Movimento nao encontrado.");
    }
    const data = snapshot.data();
    const productId = typeof data.productId === "string" ? data.productId : "";
    const rawQty = data.effectiveQty ?? data.qty ?? 0;
    const movementQty = Number(rawQty);
    const movementType = typeof data.type === "string" ? data.type : "out";
    if (productId && Number.isFinite(movementQty) && movementQty > 0) {
      const productRef = firestore.doc(db, "products", productId);
      const productSnapshot = await transaction.get(productRef);
      if (productSnapshot.exists()) {
        const productData = productSnapshot.data();
        const currentQuantity = Number(productData.quantity ?? 0);
        const unitPrice = Number(productData.unitPrice ?? 0);
        let newQuantity = currentQuantity;
        if (movementType === "out") {
          newQuantity = currentQuantity + movementQty;
        } else if (movementType === "in") {
          newQuantity = currentQuantity - movementQty;
          if (newQuantity < 0) {
            newQuantity = 0;
          }
        }
        const newTotalValue = Number((newQuantity * unitPrice).toFixed(2));
        transaction.update(productRef, {
          quantity: newQuantity,
          totalValue: newTotalValue
        });
      }
    }
    transaction.delete(movementRef);
  });
}
export async function fetchStockMovementsForExport(
  filters: StockMovementsFilters,
  maxRecords = 1000
): Promise<StockMovementWithProduct[]> {
  const mergedFilters = { ...filters };
  let cursor = mergedFilters.startAfter ?? null;
  const collected: StockMovementWithProduct[] = [];

  while (collected.length < maxRecords) {
    const { movements, nextCursor } = await fetchStockMovements({
      ...mergedFilters,
      startAfter: cursor,
      limit: Math.min(200, maxRecords - collected.length)
    });

    collected.push(...movements);

    if (!nextCursor || movements.length === 0) {
      break;
    }

    cursor = nextCursor;
  }

  return collected.slice(0, maxRecords);
}

export interface SaveTrackingCodeInput {
  code: string;
  userId: string;
  userName: string;
  productSku?: string;
  productName?: string;
  stockMovementId?: string;
}

export interface TrackingCodeFilters {
  limit?: number;
  startAfter?: any;
  userId?: string;
  code?: string;
  range?: { start?: Date | null; end?: Date | null };
}

export interface TrackingCodesPage {
  records: TrackingCodeRecord[];
  nextCursor: any;
}

function mapTrackingCodeSnapshot(doc: any): TrackingCodeRecord {
  const data = doc.data ? doc.data() : {};
  const createdAtValue = data.createdAt && typeof data.createdAt.toMillis === "function"
    ? data.createdAt.toMillis()
    : Number(data.createdAt ?? 0);
  return {
    id: doc.id,
    code: typeof data.code === "string" ? data.code : "",
    userId: typeof data.userId === "string" ? data.userId : "",
    userName: typeof data.userName === "string" ? data.userName : "",
    createdAt: createdAtValue,
    productSku: typeof data.productSku === "string" && data.productSku.length ? data.productSku : undefined,
    productName: typeof data.productName === "string" && data.productName.length ? data.productName : undefined,
    stockMovementId:
      typeof data.stockMovementId === "string" && data.stockMovementId.length ? data.stockMovementId : undefined
  };
}

export async function saveTrackingCode(input: SaveTrackingCodeInput): Promise<TrackingCodeRecord> {
  const { code, userId, userName, productSku, productName, stockMovementId } = input;
  if (!userId) {
    throw new Error("Usuario nao autenticado.");
  }
  const sanitizedCode = typeof code === "string" ? code.trim() : "";
  if (!sanitizedCode) {
    throw new Error("Informe um codigo valido.");
  }
  const normalizedCode = sanitizedCode.toUpperCase();
  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;
  const collectionRef = firestore.collection(db, "trackingCodes");
  const payload: Record<string, any> = {
    code: sanitizedCode,
    codeNormalized: normalizedCode,
    userId,
    userName: (userName ?? "").trim() || "desconhecido",
    createdAt: firestore.serverTimestamp()
  };
  const trimmedSku = typeof productSku === "string" ? productSku.trim() : "";
  if (trimmedSku) {
    payload.productSku = trimmedSku;
  }
  const trimmedProductName = typeof productName === "string" ? productName.trim() : "";
  if (trimmedProductName) {
    payload.productName = trimmedProductName;
  }
  const trimmedMovementId = typeof stockMovementId === "string" ? stockMovementId.trim() : "";
  if (trimmedMovementId) {
    payload.stockMovementId = trimmedMovementId;
  }
  const docRef = await firestore.addDoc(collectionRef, payload);
  const snapshot = await firestore.getDoc(docRef);
  if (!snapshot.exists()) {
    throw new Error("Falha ao registrar o codigo de rastreamento.");
  }
  return mapTrackingCodeSnapshot(snapshot);
}

export async function fetchTrackingCodes(filters: TrackingCodeFilters): Promise<TrackingCodesPage> {
  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;
  const ref = firestore.collection(db, "trackingCodes");
  const constraints: any[] = [];
  const sanitizedUser = typeof filters.userId === "string" ? filters.userId.trim() : "";
  if (sanitizedUser) {
    constraints.push(firestore.where("userId", "==", sanitizedUser));
  }
  const sanitizedCode = typeof filters.code === "string" ? filters.code.trim().toUpperCase() : "";
  const hasCodeSearch = Boolean(sanitizedCode);
  if (hasCodeSearch) {
    constraints.push(firestore.orderBy("codeNormalized"));
    constraints.push(firestore.startAt(sanitizedCode));
    constraints.push(firestore.endAt(`${sanitizedCode}\uf8ff`));
  } else {
    constraints.push(firestore.orderBy("createdAt", "desc"));
    if (filters.range?.start instanceof Date) {
      constraints.push(
        firestore.where("createdAt", ">=", firestore.Timestamp.fromDate(filters.range.start))
      );
    }
    if (filters.range?.end instanceof Date) {
      constraints.push(
        firestore.where("createdAt", "<=", firestore.Timestamp.fromDate(filters.range.end))
      );
    }
  }
  if (filters.startAfter) {
    constraints.push(firestore.startAfter(filters.startAfter));
  }
  const pageLimit = filters.limit ?? 25;
  constraints.push(firestore.limit(pageLimit));
  const query = firestore.query(ref, ...constraints);
  const snapshot = await firestore.getDocs(query);
  let records = snapshot.docs.map((doc: any) => mapTrackingCodeSnapshot(doc));
  if (hasCodeSearch && filters.range) {
    const startMs = filters.range.start instanceof Date ? filters.range.start.getTime() : null;
    const endMs = filters.range.end instanceof Date ? filters.range.end.getTime() : null;
    records = records.filter((record: TrackingCodeRecord) => {
      if (startMs && record.createdAt && record.createdAt < startMs) {
        return false;
      }
      if (endMs && record.createdAt && record.createdAt > endMs) {
        return false;
      }
      return true;
    });
    records.sort((a: TrackingCodeRecord, b: TrackingCodeRecord) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }
  const nextCursor = snapshot.docs.length === pageLimit ? snapshot.docs[snapshot.docs.length - 1] : null;
  return { records, nextCursor };
}

export async function deleteTrackingCode(codeId: string): Promise<void> {
  if (!codeId) {
    throw new Error("Codigo invalido.");
  }
  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;
  const docRef = firestore.doc(db, "trackingCodes", codeId);
  await firestore.deleteDoc(docRef);
}
export interface MovementUserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function fetchMovementUsers(): Promise<MovementUserOption[]> {
  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;
  const usersRef = firestore.collection(db, "users");
  const snapshot = await firestore.getDocs(usersRef);

  return snapshot.docs.map((doc: any) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.displayName || data.email || "desconhecido",
      email: data.email || "",
      role: data.role || "staff"
    };
  });
}

interface ProductSummary {
  name: string;
  unitPrice?: number;
}

async function loadProductSummaries(ids: string[]): Promise<Map<string, ProductSummary>> {
  if (!ids.length) {
    return new Map();
  }

  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;
  const unique = Array.from(new Set(ids));
  const map = new Map<string, ProductSummary>();

  await Promise.all(
    unique.map(async (id) => {
      try {
        const docRef = firestore.doc(db, "products", id);
        const snapshot = await firestore.getDoc(docRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          const summary: ProductSummary = {
            name: typeof data.name === "string" ? data.name : ""
          };
          const rawUnitPrice = Number(data.unitPrice);
          if (Number.isFinite(rawUnitPrice)) {
            summary.unitPrice = Number(rawUnitPrice.toFixed(2));
          }
          map.set(id, summary);
        }
      } catch (error) {
        console.error("Falha ao carregar nome do produto", error);
      }
    })
  );

  return map;
}

const TASK_OPTIONS_COLLECTION = "taskOptions";
const TASK_ASSIGNMENTS_COLLECTION = "tasks";
const DEFAULT_TASK_COLOR = "#0F172A";
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizeHexColor(color?: string | null): string {
  if (!color) {
    return DEFAULT_TASK_COLOR;
  }
  const trimmed = color.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) {
    return DEFAULT_TASK_COLOR;
  }
  if (trimmed.length === 4) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toUpperCase();
  }
  return trimmed.toUpperCase();
}

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function mapTaskOptionDoc(doc: any): TaskOption {
  const data = doc?.data ? doc.data() : {};
  const rawType = typeof data.type === "string" ? data.type : "";
  const type: TaskOptionType =
    rawType === "platform" || rawType === "account" || rawType === "task" ? rawType : "task";
  const rawName = safeTrim(data.name ?? data.label);
  const name = rawName.length ? rawName : "Item sem nome";
  const colorValue = safeTrim(data.color);
  const color = colorValue && HEX_COLOR_PATTERN.test(colorValue) ? normalizeHexColor(colorValue) : DEFAULT_TASK_COLOR;
  return {
    id: doc.id,
    type,
    name,
    color
  };
}

function toMillis(value: any): number | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return undefined;
}

function mapTaskAssignmentSnapshot(doc: any): TaskAssignment {
  const data = doc?.data ? doc.data() : {};
  const statusValue = typeof data.status === "string" ? data.status : "pending";
  const status: TaskStatus =
    statusValue === "completed" || statusValue === "archived" || statusValue === "pending"
      ? statusValue
      : "pending";
  const normalizeOptionalColor = (key: string): string | undefined => {
    const value = safeTrim(data[key]);
    if (!value) {
      return undefined;
    }
    return HEX_COLOR_PATTERN.test(value) ? normalizeHexColor(value) : undefined;
  };
  const createdAt = toMillis(data.createdAt) ?? Date.now();
  const assignment: TaskAssignment = {
    id: doc.id,
    taskOptionId: safeTrim(data.taskOptionId) || undefined,
    taskLabel: safeTrim(data.taskLabel) || "Tarefa",
    taskColor: normalizeOptionalColor("taskColor"),
    platformId: safeTrim(data.platformId) || undefined,
    platformLabel: safeTrim(data.platformLabel) || undefined,
    platformColor: normalizeOptionalColor("platformColor"),
    accountId: safeTrim(data.accountId) || undefined,
    accountLabel: safeTrim(data.accountLabel) || undefined,
    accountColor: normalizeOptionalColor("accountColor"),
    productId: safeTrim(data.productId) || undefined,
    productSku: safeTrim(data.productSku) || undefined,
    productName: safeTrim(data.productName) || undefined,
    userId: safeTrim(data.userId),
    userName: safeTrim(data.userName) || "desconhecido",
    assignedById: safeTrim(data.assignedById),
    assignedByName: safeTrim(data.assignedByName) || "desconhecido",
    status,
    notes: safeTrim(data.notes) || undefined,
    dueDate: toMillis(data.dueDate),
    createdAt,
    updatedAt: toMillis(data.updatedAt),
    completedAt: toMillis(data.completedAt)
  };
  return assignment;
}

export async function fetchTaskOptions(type: TaskOptionType): Promise<TaskOption[]> {
  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;
  const ref = firestore.collection(db, TASK_OPTIONS_COLLECTION);
  const snapshot = await firestore.getDocs(firestore.query(ref, firestore.where("type", "==", type)));
  const items = snapshot.docs.map((doc: any) => mapTaskOptionDoc(doc));
  items.sort((a: TaskOption, b: TaskOption) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  return items;
}

export interface TaskMetadata {
  tasks: TaskOption[];
  platforms: TaskOption[];
  accounts: TaskOption[];
}

export async function fetchTaskMetadata(): Promise<TaskMetadata> {
  const [tasks, platforms, accounts] = await Promise.all([
    fetchTaskOptions("task"),
    fetchTaskOptions("platform"),
    fetchTaskOptions("account")
  ]);
  return { tasks, platforms, accounts };
}

export interface UpsertTaskOptionInput {
  name: string;
  color?: string;
}

export async function createTaskOption(
  type: TaskOptionType,
  input: UpsertTaskOptionInput
): Promise<TaskOption> {
  const sanitizedName = safeTrim(input.name);
  if (!sanitizedName) {
    throw new Error("Informe um nome valido.");
  }
  const color = normalizeHexColor(input.color);
  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;
  const collectionRef = firestore.collection(db, TASK_OPTIONS_COLLECTION);
  const docRef = await firestore.addDoc(collectionRef, {
    type,
    name: sanitizedName,
    color,
    nameNormalized: sanitizedName.toLowerCase(),
    createdAt: firestore.serverTimestamp(),
    updatedAt: firestore.serverTimestamp()
  });
  const snapshot = await firestore.getDoc(docRef);
  return mapTaskOptionDoc(snapshot);
}

export async function updateTaskOption(optionId: string, input: UpsertTaskOptionInput): Promise<void> {
  const sanitizedId = safeTrim(optionId);
  if (!sanitizedId) {
    throw new Error("Opcao invalida.");
  }
  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;
  const updates: Record<string, any> = {
    updatedAt: firestore.serverTimestamp()
  };
  const trimmedName = safeTrim(input.name);
  if (trimmedName) {
    updates.name = trimmedName;
    updates.nameNormalized = trimmedName.toLowerCase();
  }
  if (Object.prototype.hasOwnProperty.call(input, "color")) {
    updates.color = normalizeHexColor(input.color);
  }
  const docRef = firestore.doc(db, TASK_OPTIONS_COLLECTION, sanitizedId);
  await firestore.updateDoc(docRef, updates);
}

export async function deleteTaskOption(optionId: string): Promise<void> {
  const sanitizedId = safeTrim(optionId);
  if (!sanitizedId) {
    throw new Error("Opcao invalida.");
  }
  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;
  const docRef = firestore.doc(db, TASK_OPTIONS_COLLECTION, sanitizedId);
  await firestore.deleteDoc(docRef);
}

export interface NewTaskAssignmentInput {
  taskOptionId?: string | null;
  taskLabel: string;
  taskColor?: string | null;
  platformId?: string | null;
  platformLabel?: string | null;
  platformColor?: string | null;
  accountId?: string | null;
  accountLabel?: string | null;
  accountColor?: string | null;
  productId?: string | null;
  productSku?: string | null;
  productName?: string | null;
  userId: string;
  userName: string;
  assignedById: string;
  assignedByName: string;
  notes?: string | null;
  dueDate?: number | Date | null;
}

function buildDueDateTimestamp(firestoreModule: any, value?: number | Date | null) {
  if (!value) {
    return undefined;
  }
  if (value instanceof Date) {
    const time = value.getTime();
    if (!Number.isFinite(time)) {
      return undefined;
    }
    return firestoreModule.Timestamp.fromMillis(time);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return firestoreModule.Timestamp.fromMillis(value);
  }
  return undefined;
}

export async function createTaskAssignment(input: NewTaskAssignmentInput): Promise<TaskAssignment> {
  const sanitizedUserId = safeTrim(input.userId);
  const sanitizedAssignedBy = safeTrim(input.assignedById);
  if (!sanitizedUserId) {
    throw new Error("Funcionario invalido.");
  }
  if (!sanitizedAssignedBy) {
    throw new Error("Responsavel invalido.");
  }
  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;
  const payload: Record<string, any> = {
    userId: sanitizedUserId,
    userName: safeTrim(input.userName) || "desconhecido",
    assignedById: sanitizedAssignedBy,
    assignedByName: safeTrim(input.assignedByName) || "desconhecido",
    status: "pending",
    taskLabel: safeTrim(input.taskLabel) || "Tarefa",
    createdAt: firestore.serverTimestamp(),
    updatedAt: firestore.serverTimestamp()
  };
  if (safeTrim(input.taskOptionId)) {
    payload.taskOptionId = safeTrim(input.taskOptionId);
  }
  if (input.taskColor) {
    payload.taskColor = normalizeHexColor(input.taskColor);
  }
  if (safeTrim(input.platformId)) {
    payload.platformId = safeTrim(input.platformId);
  }
  const platformLabel = safeTrim(input.platformLabel);
  if (platformLabel) {
    payload.platformLabel = platformLabel;
  }
  if (input.platformColor) {
    payload.platformColor = normalizeHexColor(input.platformColor);
  }
  if (safeTrim(input.accountId)) {
    payload.accountId = safeTrim(input.accountId);
  }
  const accountLabel = safeTrim(input.accountLabel);
  if (accountLabel) {
    payload.accountLabel = accountLabel;
  }
  if (input.accountColor) {
    payload.accountColor = normalizeHexColor(input.accountColor);
  }
  const productId = safeTrim(input.productId);
  if (productId) {
    payload.productId = productId;
  }
  const productSku = safeTrim(input.productSku);
  if (productSku) {
    payload.productSku = productSku.toUpperCase();
  }
  const productName = safeTrim(input.productName);
  if (productName) {
    payload.productName = productName;
  }
  const notes = safeTrim(input.notes);
  if (notes) {
    payload.notes = notes;
  }
  const dueTimestamp = buildDueDateTimestamp(firestore, input.dueDate);
  if (dueTimestamp) {
    payload.dueDate = dueTimestamp;
  }
  const collectionRef = firestore.collection(db, TASK_ASSIGNMENTS_COLLECTION);
  const docRef = await firestore.addDoc(collectionRef, payload);
  const snapshot = await firestore.getDoc(docRef);
  return mapTaskAssignmentSnapshot(snapshot);
}

export interface TaskQueryOptions {
  status?: TaskStatus | "all";
  assignedTo?: string;
  platformId?: string;
  accountId?: string;
  limit?: number;
}

function applyTaskFilters(list: TaskAssignment[], options: TaskQueryOptions): TaskAssignment[] {
  let filtered = [...list];
  if (options.status && options.status !== "all") {
    filtered = filtered.filter((item) => item.status === options.status);
  }
  const assigned = safeTrim(options.assignedTo);
  if (assigned) {
    filtered = filtered.filter((item) => item.userId === assigned);
  }
  const platformId = safeTrim(options.platformId);
  if (platformId) {
    filtered = filtered.filter((item) => item.platformId === platformId);
  }
  const accountId = safeTrim(options.accountId);
  if (accountId) {
    filtered = filtered.filter((item) => item.accountId === accountId);
  }
  return filtered;
}

export async function fetchTasksForAdmin(options: TaskQueryOptions = {}): Promise<TaskAssignment[]> {
  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;
  const ref = firestore.collection(db, TASK_ASSIGNMENTS_COLLECTION);
  const limitValue = options.limit && Number.isFinite(options.limit)
    ? Math.max(1, Math.min(500, Math.floor(options.limit)))
    : 400;
  const querySnapshot = await firestore.getDocs(
    firestore.query(ref, firestore.orderBy("createdAt", "desc"), firestore.limit(limitValue))
  );
  const list = querySnapshot.docs.map((doc: any) => mapTaskAssignmentSnapshot(doc));
  return applyTaskFilters(list, options);
}

export async function fetchTasksForUser(
  userId: string,
  options: TaskQueryOptions = {}
): Promise<TaskAssignment[]> {
  const sanitizedUserId = safeTrim(userId);
  if (!sanitizedUserId) {
    return [];
  }
  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;
  const ref = firestore.collection(db, TASK_ASSIGNMENTS_COLLECTION);
  const query = firestore.query(ref, firestore.where("userId", "==", sanitizedUserId));
  const snapshot = await firestore.getDocs(query);
  const list: TaskAssignment[] = snapshot.docs.map((doc: any) => mapTaskAssignmentSnapshot(doc));
  list.sort((a: TaskAssignment, b: TaskAssignment) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return applyTaskFilters(list, options);
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
  const sanitizedId = safeTrim(taskId);
  if (!sanitizedId) {
    throw new Error("Tarefa invalida.");
  }
  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;
  const docRef = firestore.doc(db, TASK_ASSIGNMENTS_COLLECTION, sanitizedId);
  const payload: Record<string, any> = {
    status,
    updatedAt: firestore.serverTimestamp()
  };
  if (status === "completed") {
    payload.completedAt = firestore.serverTimestamp();
  } else {
    payload.completedAt = firestore.deleteField();
  }
  await firestore.updateDoc(docRef, payload);
}

export interface UpdateTaskDetailsInput {
  notes?: string | null;
  dueDate?: number | Date | null;
}

export async function updateTaskDetails(taskId: string, updates: UpdateTaskDetailsInput): Promise<void> {
  const sanitizedId = safeTrim(taskId);
  if (!sanitizedId) {
    throw new Error("Tarefa invalida.");
  }
  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;
  const docRef = firestore.doc(db, TASK_ASSIGNMENTS_COLLECTION, sanitizedId);
  const payload: Record<string, any> = {
    updatedAt: firestore.serverTimestamp()
  };
  if (Object.prototype.hasOwnProperty.call(updates, "notes")) {
    const notes = safeTrim(updates.notes);
    if (notes) {
      payload.notes = notes;
    } else {
      payload.notes = firestore.deleteField();
    }
  }
  if (Object.prototype.hasOwnProperty.call(updates, "dueDate")) {
    const dueTimestamp = buildDueDateTimestamp(firestore, updates.dueDate);
    if (dueTimestamp) {
      payload.dueDate = dueTimestamp;
    } else {
      payload.dueDate = firestore.deleteField();
    }
  }
  await firestore.updateDoc(docRef, payload);
}

export async function deleteTaskAssignment(taskId: string): Promise<void> {
  const sanitizedId = safeTrim(taskId);
  if (!sanitizedId) {
    throw new Error("Tarefa invalida.");
  }
  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;
  const docRef = firestore.doc(db, TASK_ASSIGNMENTS_COLLECTION, sanitizedId);
  await firestore.deleteDoc(docRef);
}
