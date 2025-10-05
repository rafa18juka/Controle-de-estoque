import type { Product, ProductKit, StockMovement, TrackingCodeProductLink, TrackingCodeRecord } from "./types";
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
    return {
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
  });

  const productIds = Array.from(
    new Set(
      movements
        .map((movement) => movement.productId)
        .filter((id): id is string => Boolean(id))
    )
  );

  const productNames = await loadProductNames(productIds);

  const enriched = movements.map((movement) => ({
    ...movement,
    productName: productNames.get(movement.productId ?? "") ?? ""
  }));

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
  products?: TrackingCodeProductLink[];
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
  const rawProducts = Array.isArray(data.products) ? data.products : [];
  const products = rawProducts
    .map((item: any): TrackingCodeProductLink | null => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const sku = typeof item.sku === "string" ? item.sku.trim() : "";
      if (!sku) {
        return null;
      }
      const nameValue = typeof item.name === "string" ? item.name.trim() : "";
      const scannedSkuValue = typeof item.scannedSku === "string" ? item.scannedSku.trim() : "";
      const quantityValue = Number(item.quantity);
      const quantity = Number.isFinite(quantityValue) ? quantityValue : undefined;
      return {
        sku,
        name: nameValue || undefined,
        scannedSku: scannedSkuValue || undefined,
        quantity
      };
    })
    .filter((entry: TrackingCodeProductLink | null): entry is TrackingCodeProductLink => Boolean(entry));

  return {
    id: doc.id,
    code: typeof data.code === "string" ? data.code : "",
    userId: typeof data.userId === "string" ? data.userId : "",
    userName: typeof data.userName === "string" ? data.userName : "",
    createdAt: createdAtValue,
    productSku: typeof data.productSku === "string" && data.productSku.length ? data.productSku : undefined,
    productName: typeof data.productName === "string" && data.productName.length ? data.productName : undefined,
    stockMovementId:
      typeof data.stockMovementId === "string" && data.stockMovementId.length ? data.stockMovementId : undefined,
    products: products.length ? products : undefined
  };
}

export async function saveTrackingCode(input: SaveTrackingCodeInput): Promise<TrackingCodeRecord> {
  const { code, userId, userName, productSku, productName, stockMovementId, products } = input;
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
  const trimmedProductName = typeof productName === "string" ? productName.trim() : "";
  const trimmedMovementId = typeof stockMovementId === "string" ? stockMovementId.trim() : "";

  const sanitizedProducts = Array.isArray(products)
    ? products
        .map((item): TrackingCodeProductLink | null => {
          if (!item) {
            return null;
          }
          const sku = typeof item.sku === "string" ? item.sku.trim() : "";
          if (!sku) {
            return null;
          }
          const nameValue = typeof item.name === "string" ? item.name.trim() : "";
          const scannedSkuValue = typeof item.scannedSku === "string" ? item.scannedSku.trim() : "";
          const quantityValue = Number(item.quantity);
          const quantity = Number.isFinite(quantityValue) ? quantityValue : undefined;
          return {
            sku,
            name: nameValue || undefined,
            scannedSku: scannedSkuValue || undefined,
            quantity
          };
        })
        .filter((entry: TrackingCodeProductLink | null): entry is TrackingCodeProductLink => Boolean(entry))
    : [];

  if (trimmedMovementId) {
    payload.stockMovementId = trimmedMovementId;
  }

  if (sanitizedProducts.length) {
    payload.products = sanitizedProducts.map((item) => {
      const value: Record<string, any> = { sku: item.sku };
      if (item.name) {
        value.name = item.name;
      }
      if (typeof item.quantity === "number") {
        value.quantity = item.quantity;
      }
      if (item.scannedSku) {
        value.scannedSku = item.scannedSku;
      }
      return value;
    });
  }

  const primarySku = trimmedSku || (sanitizedProducts[0]?.sku ?? "");
  const primaryName = trimmedProductName || (sanitizedProducts[0]?.name ?? "");

  if (primarySku) {
    payload.productSku = primarySku;
  }
  if (primaryName) {
    payload.productName = primaryName;
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

async function loadProductNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) {
    return new Map();
  }

  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;
  const unique = Array.from(new Set(ids));
  const map = new Map<string, string>();

  await Promise.all(
    unique.map(async (id) => {
      try {
        const docRef = firestore.doc(db, "products", id);
        const snapshot = await firestore.getDoc(docRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          map.set(id, data.name ?? "");
        }
      } catch (error) {
        console.error("Falha ao carregar nome do produto", error);
      }
    })
  );

  return map;
}















