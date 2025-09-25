import type { Product, StockMovement } from "./types";
import { ensureFirebase } from "./firebase-client";

export interface StockOutInput {
  sku: string;
  qty: number;
  userId: string;
  userName: string;
}

export interface StockOutResult {
  product: Product;
}

export async function getProductBySku(sku: string): Promise<Product | null> {
  const sanitized = sku.trim();
  if (!sanitized) {
    return null;
  }

  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;
  const productsRef = firestore.collection(db, "products");
  const query = firestore.query(productsRef, firestore.where("sku", "==", sanitized), firestore.limit(1));
  const snapshot = await firestore.getDocs(query);

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();
  return { id: doc.id, ...data } as Product;
}

export async function processStockOut(input: StockOutInput): Promise<StockOutResult> {
  const { sku, qty, userId, userName } = input;
  if (!userId) {
    throw new Error("Usuario nao autenticado.");
  }

  if (qty <= 0) {
    throw new Error("Informe uma quantidade valida.");
  }

  const bundle = await ensureFirebase();
  const { firestore, db } = bundle;

  const productSnapshot = await firestore.getDocs(
    firestore.query(
      firestore.collection(db, "products"),
      firestore.where("sku", "==", sku.trim()),
      firestore.limit(1)
    )
  );

  if (productSnapshot.empty) {
    throw new Error("Produto nao encontrado para este SKU.");
  }

  const productDoc = productSnapshot.docs[0];
  const productRef = firestore.doc(db, "products", productDoc.id);

  let updatedProduct: Product | null = null;

  await firestore.runTransaction(db, async (transaction: any) => {
    const snapshot = await transaction.get(productRef);
    if (!snapshot.exists()) {
      throw new Error("Produto nao encontrado.");
    }

    const data = snapshot.data();
    const currentQuantity = Number(data.quantity ?? 0);
    const unitPrice = Number(data.unitPrice ?? 0);

    if (currentQuantity < qty) {
      throw new Error("Estoque insuficiente para essa saida.");
    }

    const newQuantity = currentQuantity - qty;
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
      sku: data.sku,
      qty,
      type: "out",
      userId,
      userName: userName || "desconhecido",
      timestamp: firestore.serverTimestamp()
    });

    updatedProduct = {
      id: productRef.id,
      name: data.name,
      sku: data.sku,
      unitPrice,
      category: data.category,
      supplier: data.supplier,
      quantity: newQuantity,
      totalValue: newTotalValue
    } as Product;
  });

  if (!updatedProduct) {
    throw new Error("Falha ao atualizar o produto.");
  }

  return { product: updatedProduct };
}

export interface StockMovementsFilters {
  limit?: number;
  startAfter?: any;
  sku?: string;
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

  if (filters.sku) {
    constraints.push(firestore.where("sku", "==", filters.sku.trim()));
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
      productId: data.productId,
      sku: data.sku,
      qty: data.qty,
      type: data.type,
      userId: data.userId,
      userName: data.userName,
      timestamp: timestampValue
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
