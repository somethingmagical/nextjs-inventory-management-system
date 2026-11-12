"use client";

import Image from "next/image";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Prisma } from "@prisma/client";
import {
  Banknote,
  CalendarDays,
  Calculator,
  Check,
  ChevronDown,
  CircleCheck,
  Gauge,
  Hand,
  Home,
  List,
  Maximize,
  Minus,
  PackageOpen,
  Pencil,
  Plus,
  RotateCw,
  Search,
  ShoppingBag,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { CountryCityFields, PhoneNumberInput } from "@/components/shared/GeographyFields";
import {
  calculatePurchaseLineTotals,
  calculatePurchaseTotals,
} from "@/lib/purchase-pricing";
import { createSale } from "@/app/(authenticated)/sales/create/actions";
import { initialSaleCreateActionState } from "@/app/(authenticated)/sales/create/action-state";
import { createPosCustomer, initialPosCustomerActionState, loadPosProducts } from "./actions";
import type { CustomerField } from "@/app/(authenticated)/customers/create/action-state";
import type { PosOption, PosProduct } from "./types";

type PosCartItem = PosProduct & {
  quantity: string;
  discountType: "Fixed" | "Percentage";
  discount: string;
};

type PosItemEdit = Pick<PosCartItem, "price" | "taxRate" | "taxType" | "discountType" | "discount">;

type HeldPosOrder = {
  id: string;
  heldAt: number;
  customerId: string;
  customerName: string;
  warehouseId: string;
  warehouseName: string;
  cart: PosCartItem[];
  orderTax: string;
  orderDiscount: string;
  shipping: string;
};

type PosReceipt = {
  saleId: string;
  reference: string;
  customerName: string;
  warehouseName: string;
  date: string;
  paymentType: string;
  total: string;
  change: string;
  items: {
    name: string;
    code: string;
    quantity: string;
    unit: string;
    price: string;
    subtotal: string;
  }[];
};

const cardColors = [
  ["#E48FA6", "#C75C7E"],
  ["#9FB6C9", "#6E8BA6"],
  ["#8FC9A6", "#4E9E73"],
  ["#E8A6B4", "#D06A82"],
  ["#E79BB0", "#CE6B88"],
];

function formatPrice(price: string) {
  return Number(price).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMoney(amount: Prisma.Decimal) {
  const [whole, fraction] = amount.toFixed(2).split(".");
  return `$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

function formatStock(stock: string) {
  return Number(stock).toLocaleString("en-US", {
    maximumFractionDigits: 3,
  });
}

function formatQuantity(quantity: Prisma.Decimal) {
  return quantity.toDecimalPlaces(3).toString();
}

function decimalValue(value: string) {
  const parsed = new Prisma.Decimal(value);
  return parsed.isFinite() ? parsed : new Prisma.Decimal(0);
}

export default function PosScreen({
  warehouses,
  customers,
  categories,
  brands,
  initialProducts,
  defaultCustomerId,
  initialWarehouseId,
  canCreateCustomers,
}: {
  warehouses: PosOption[];
  customers: PosOption[];
  categories: PosOption[];
  brands: PosOption[];
  initialProducts: PosProduct[];
  defaultCustomerId: string;
  initialWarehouseId: string;
  canCreateCustomers: boolean;
}) {
  const [customerId, setCustomerId] = useState(defaultCustomerId);
  const [customerOptions, setCustomerOptions] = useState(customers);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId);
  const [products, setProducts] = useState(initialProducts);
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [brandId, setBrandId] = useState("all");
  const [loadError, setLoadError] = useState("");
  const [orderTax, setOrderTax] = useState("0.00");
  const [orderDiscount, setOrderDiscount] = useState("0.00");
  const [shipping, setShipping] = useState("0.00");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemEdit, setItemEdit] = useState<PosItemEdit | null>(null);
  const [itemEditError, setItemEditError] = useState("");
  const [heldOrders, setHeldOrders] = useState<HeldPosOrder[]>([]);
  const [isHeldOrdersOpen, setIsHeldOrdersOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [paymentType, setPaymentType] = useState("Cash");
  const [tenderedAmount, setTenderedAmount] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paymentActionError, setPaymentActionError] = useState("");
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);
  const [isLoading, startLoading] = useTransition();
  const [saleActionState, saleFormAction, isSavingSale] = useActionState(
    createSale,
    initialSaleCreateActionState,
  );
  const saleFormRef = useRef<HTMLFormElement>(null);
  const pendingReceiptRef = useRef<Omit<PosReceipt, "saleId" | "reference"> | null>(null);
  const requestId = useRef(0);
  const lastLoadedWarehouseId = useRef(initialWarehouseId);

  const handleCustomerCreated = useCallback((customer: PosOption) => {
    setCustomerOptions((current) => [...current, customer]);
    setCustomerId(customer.id);
    setIsCustomerModalOpen(false);
  }, []);

  const [saleDate] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });

  useEffect(() => {
    if (!editingItemId) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeItemEditor();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editingItemId]);

  useEffect(() => {
    if (!isHeldOrdersOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsHeldOrdersOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isHeldOrdersOpen]);

  useEffect(() => {
    if (!isPaymentOpen && !receipt) return;
    if (isSavingSale) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (receipt) setReceipt(null);
      else setIsPaymentOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isPaymentOpen, isSavingSale, receipt]);

  useEffect(() => {
    if (saleActionState.status === "error") {
      setPaymentActionError(saleActionState.message);
      return;
    }
    if (saleActionState.status !== "success" || !saleActionState.saleId || !saleActionState.reference) return;

    setPaymentActionError("");
    const receiptData = pendingReceiptRef.current;
    pendingReceiptRef.current = null;
    if (receiptData) {
      setReceipt({
        saleId: saleActionState.saleId,
        reference: saleActionState.reference,
        ...receiptData,
      });
    }
    setIsPaymentOpen(false);
    clearCurrentOrder();
    setTenderedAmount("");
    setPaymentError("");
    startLoading(async () => {
      const result = await loadPosProducts(warehouseId);
      if (result.status === "error") {
        setLoadError(result.message);
        setProducts([]);
        return;
      }
      setLoadError("");
      setProducts(result.products);
    });
  }, [saleActionState, startLoading, warehouseId]);

  useEffect(() => {
    if (!warehouseId || warehouseId === lastLoadedWarehouseId.current) return;
    lastLoadedWarehouseId.current = warehouseId;
    const currentRequestId = ++requestId.current;

    startLoading(async () => {
      const result = await loadPosProducts(warehouseId);
      if (currentRequestId !== requestId.current) return;
      if (result.status === "error") {
        setLoadError(result.message);
        setProducts([]);
        return;
      }
      setLoadError("");
      setProducts(result.products);
    });
  }, [startLoading, warehouseId]);

  const visibleProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return products.filter((product) => (
      (categoryId === "all" || product.categoryId === categoryId)
      && (brandId === "all" || product.brandId === brandId)
      && (!normalizedSearch
        || product.name.toLocaleLowerCase().includes(normalizedSearch)
        || product.code.toLocaleLowerCase().includes(normalizedSearch))
    ));
  }, [brandId, categoryId, products, search]);

  const { lineTotals, orderTotals, totalQuantity, pricingError } = useMemo(() => {
    const nextLineTotals = new Map<string, ReturnType<typeof calculatePurchaseLineTotals>>();
    try {
      for (const item of cart) {
        nextLineTotals.set(item.id, calculatePurchaseLineTotals({
          unitCost: item.price,
          quantity: item.quantity,
          discountType: item.discountType,
          discount: item.discount,
          taxType: item.taxType,
          taxRate: item.taxRate,
        }));
      }

      const nextOrderTotals = calculatePurchaseTotals({
        lineSubtotals: Array.from(nextLineTotals.values(), (totals) => totals.subtotal),
        orderTaxRate: orderTax,
        discount: orderDiscount,
        shipping,
      });
      const nextQuantity = cart.reduce(
        (total, item) => total.plus(new Prisma.Decimal(item.quantity)),
        new Prisma.Decimal(0),
      );
      return {
        lineTotals: nextLineTotals,
        orderTotals: nextOrderTotals,
        totalQuantity: formatQuantity(nextQuantity),
        pricingError: "",
      };
    } catch (error) {
      return {
        lineTotals: nextLineTotals,
        orderTotals: null,
        totalQuantity: "—",
        pricingError: error instanceof Error ? error.message : "Enter valid pricing values.",
      };
    }
  }, [cart, orderDiscount, orderTax, shipping]);

  const parsedTenderedAmount = useMemo(() => {
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(tenderedAmount)) return null;
    try {
      return new Prisma.Decimal(tenderedAmount);
    } catch {
      return null;
    }
  }, [tenderedAmount]);

  const changeDue = parsedTenderedAmount && orderTotals
    ? Prisma.Decimal.max(parsedTenderedAmount.minus(orderTotals.grandTotal), new Prisma.Decimal(0))
    : null;

  function addProduct(product: PosProduct) {
    const availableStock = decimalValue(product.stock);
    if (availableStock.isZero() || availableStock.isNegative()) return;

    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        const currentQuantity = decimalValue(existing.quantity);
        const remainingStock = availableStock.minus(currentQuantity);
        if (remainingStock.isZero() || remainingStock.isNegative()) return current;
        const increment = Prisma.Decimal.min(remainingStock, new Prisma.Decimal(1));
        return current.map((item) => item.id === product.id
          ? { ...item, quantity: currentQuantity.plus(increment).toString() }
          : item);
      }
      return [...current, {
        ...product,
        quantity: Prisma.Decimal.min(availableStock, new Prisma.Decimal(1)).toString(),
        discountType: "Fixed",
        discount: "0.00",
      }];
    });
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((current) => current.map((item) => {
      if (item.id !== productId) return item;
      const currentQuantity = decimalValue(item.quantity);
      const availableStock = decimalValue(item.stock);
      if (delta > 0) {
        const remainingStock = availableStock.minus(currentQuantity);
        if (remainingStock.isZero() || remainingStock.isNegative()) return item;
        const increment = Prisma.Decimal.min(remainingStock, new Prisma.Decimal(delta));
        return { ...item, quantity: currentQuantity.plus(increment).toString() };
      }
      const quantity = currentQuantity.plus(delta);
      return quantity.greaterThan(0) ? { ...item, quantity: quantity.toString() } : item;
    }));
  }

  function makeHeldOrder(): HeldPosOrder {
    return {
      id: crypto.randomUUID(),
      heldAt: Date.now(),
      customerId,
      customerName: customerOptions.find((customer) => customer.id === customerId)?.name ?? "Unknown customer",
      warehouseId,
      warehouseName: warehouses.find((warehouse) => warehouse.id === warehouseId)?.name ?? "Unknown warehouse",
      cart: cart.map((item) => ({ ...item })),
      orderTax,
      orderDiscount,
      shipping,
    };
  }

  function clearCurrentOrder() {
    setCart([]);
    setOrderTax("0.00");
    setOrderDiscount("0.00");
    setShipping("0.00");
    setEditingItemId(null);
    setItemEdit(null);
    setItemEditError("");
  }

  function openPayment() {
    if (!cart.length || !orderTotals || pricingError) return;
    setTenderedAmount(orderTotals.grandTotal.toFixed(2));
    setPaymentError("");
    setPaymentActionError("");
    setIsPaymentOpen(true);
  }

  function submitPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!orderTotals || !parsedTenderedAmount || parsedTenderedAmount.lessThan(orderTotals.grandTotal)) {
      setPaymentError("Amount tendered must cover the sale total.");
      return;
    }
    if (!saleFormRef.current) {
      setPaymentError("Payment could not be submitted. Please try again.");
      return;
    }
    pendingReceiptRef.current = {
      customerName: customerOptions.find((customer) => customer.id === customerId)?.name ?? "Unknown customer",
      warehouseName: warehouses.find((warehouse) => warehouse.id === warehouseId)?.name ?? "Unknown warehouse",
      date: saleDate,
      paymentType,
      total: orderTotals.grandTotal.toFixed(2),
      change: changeDue?.toFixed(2) ?? "0.00",
      items: cart.map((item) => ({
        name: item.name,
        code: item.code,
        quantity: item.quantity,
        unit: item.unit,
        price: item.price,
        subtotal: lineTotals.get(item.id)?.subtotal.toFixed(2) ?? "0.00",
      })),
    };
    setPaymentError("");
    setPaymentActionError("");
    saleFormRef.current.requestSubmit();
  }

  function holdCurrentOrder() {
    if (!cart.length) return;
    const heldOrder = makeHeldOrder();
    setHeldOrders((current) => [heldOrder, ...current]);
    clearCurrentOrder();
  }

  function resumeHeldOrder(heldOrderId: string) {
    const heldOrder = heldOrders.find((order) => order.id === heldOrderId);
    if (!heldOrder) return;

    if (cart.length) {
      const currentOrder = makeHeldOrder();
      setHeldOrders((current) => [
        currentOrder,
        ...current.filter((order) => order.id !== heldOrderId),
      ]);
    } else {
      setHeldOrders((current) => current.filter((order) => order.id !== heldOrderId));
    }

    setCart(heldOrder.cart.map((item) => ({ ...item })));
    setCustomerId(heldOrder.customerId);
    setOrderTax(heldOrder.orderTax);
    setOrderDiscount(heldOrder.orderDiscount);
    setShipping(heldOrder.shipping);
    if (heldOrder.warehouseId !== warehouseId) setWarehouseId(heldOrder.warehouseId);
    setIsHeldOrdersOpen(false);
  }

  function openItemEditor(item: PosCartItem) {
    setEditingItemId(item.id);
    setItemEdit({
      price: item.price,
      taxRate: item.taxRate,
      taxType: item.taxType,
      discountType: item.discountType,
      discount: item.discount,
    });
    setItemEditError("");
  }

  function closeItemEditor() {
    setEditingItemId(null);
    setItemEdit(null);
    setItemEditError("");
  }

  function saveItemEditor() {
    if (!editingItemId || !itemEdit) return;
    const currentItem = cart.find((item) => item.id === editingItemId);
    if (!currentItem) {
      closeItemEditor();
      return;
    }

    try {
      calculatePurchaseLineTotals({
        unitCost: itemEdit.price,
        quantity: currentItem.quantity,
        discountType: itemEdit.discountType,
        discount: itemEdit.discount,
        taxType: itemEdit.taxType,
        taxRate: itemEdit.taxRate,
      });
    } catch (error) {
      setItemEditError(error instanceof Error ? error.message : "Enter valid line details.");
      return;
    }

    setCart((current) => current.map((item) => (
      item.id === editingItemId ? { ...item, ...itemEdit } : item
    )));
    closeItemEditor();
  }

  return (
    <main className="pos-screen">
      <form className="pos-sale-submit-form" action={saleFormAction} ref={saleFormRef}>
        <input type="hidden" name="source" value="pos" />
        <input type="hidden" name="warehouseId" value={warehouseId} />
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="date" value={saleDate} />
        <input type="hidden" name="status" value="Received" />
        <input type="hidden" name="orderTax" value={orderTax} />
        <input type="hidden" name="discount" value={orderDiscount} />
        <input type="hidden" name="shipping" value={shipping} />
        <input type="hidden" name="paid" value={orderTotals?.grandTotal.toFixed(2) ?? "0"} />
        <input type="hidden" name="paymentType" value={paymentType} />
        <input type="hidden" name="notes" value="" />
        <input
          type="hidden"
          name="items"
          value={JSON.stringify(cart.map((item) => ({
            productId: item.id,
            price: item.price,
            quantity: item.quantity,
            unit: item.unit,
            discountType: item.discountType,
            discount: item.discount,
            taxType: item.taxType,
            orderTax: item.taxRate,
          })))}
        />
      </form>
      <section className="pos-column" aria-label="Sale cart">
        <div className="pos-toolbar">
          <div className="pos-customer-box">
            <UserRound aria-hidden="true" />
            <span className="pos-select-wrap">
              <span className="pos-select-label">Customer</span>
              <span className="pos-select-control">
                <select
                  aria-label="Customer"
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                >
                  {customerOptions.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" className="pos-select-chevron" />
              </span>
            </span>
            {canCreateCustomers && (
              <button
                className="pos-customer-add"
                type="button"
                aria-label="Add new customer"
                title="Add new customer"
                onClick={() => setIsCustomerModalOpen(true)}
              >
                <Plus aria-hidden="true" />
              </button>
            )}
          </div>
          <label className="pos-warehouse-box">
            <Home aria-hidden="true" />
            <span className="pos-select-wrap">
              <span className="pos-select-label">Warehouse</span>
              <span className="pos-select-control">
                <select
                  aria-label="Warehouse"
                  value={warehouseId}
                  disabled={!warehouses.length || isLoading}
                  onChange={(event) => {
                    if (cart.length) {
                      const heldOrder = makeHeldOrder();
                      setHeldOrders((current) => [heldOrder, ...current]);
                    }
                    clearCurrentOrder();
                    setWarehouseId(event.target.value);
                  }}
                >
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" className="pos-select-chevron" />
              </span>
            </span>
          </label>
        </div>

        <div className="pos-cart">
          <div className="pos-cart-head">
            <span>Product</span><span>Qty</span><span>Price</span><span>Sub Total</span><span />
          </div>
          <div className="pos-cart-body">
            {cart.length === 0 ? (
              <div className="pos-cart-empty">
                <PackageOpen aria-hidden="true" />
                <p>Your cart is empty</p>
                <span>Select products to start a sale.</span>
              </div>
            ) : cart.map((item) => {
              const totals = lineTotals.get(item.id);
              return (
                <div className="pos-cart-row" key={item.id}>
                  <div className="pos-cart-product">
                    <div className="pos-cart-product-name" title={item.name}>{item.name}</div>
                    <div className="pos-cart-product-meta">
                      <span className="pos-cart-code">{item.code}</span>
                      <span className="pos-cart-stock-hint">
                        Available: {formatStock(item.stock)} {item.unit}
                      </span>
                      <button
                        className="pos-cart-edit"
                        type="button"
                        aria-label={`Edit ${item.name} sale details`}
                        onClick={() => openItemEditor(item)}
                      >
                        <Pencil aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="pos-stepper">
                    <button
                      type="button"
                      aria-label={`Decrease ${item.name} quantity`}
                      disabled={new Prisma.Decimal(item.quantity).lessThanOrEqualTo(1)}
                      onClick={() => changeQuantity(item.id, -1)}
                    >
                      <Minus aria-hidden="true" />
                    </button>
                    <span className="pos-stepper-quantity">{formatStock(item.quantity)}</span>
                    <button
                      type="button"
                      aria-label={`Increase ${item.name} quantity`}
                      disabled={decimalValue(item.quantity).greaterThanOrEqualTo(decimalValue(item.stock))}
                      onClick={() => changeQuantity(item.id, 1)}
                    >
                      <Plus aria-hidden="true" />
                    </button>
                  </div>
                  <div className="pos-cart-price">$ {formatPrice(item.price)}</div>
                  <div className="pos-cart-subtotal">
                    {totals ? formatMoney(totals.subtotal) : "—"}
                  </div>
                  <button
                    className="pos-cart-remove"
                    type="button"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => setCart((current) => current.filter((entry) => entry.id !== item.id))}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="pos-cart-foot">
            <div className="pos-foot-grid">
              <div className="pos-foot-fields" aria-label="Sale adjustments">
                <label className="pos-foot-input">
                  <input aria-label="Tax" type="number" min="0" max="100" step="0.01" value={orderTax} onChange={(event) => setOrderTax(event.target.value)} />
                  <span>%</span>
                </label>
                <label className="pos-foot-input">
                  <input aria-label="Discount" type="number" min="0" step="0.01" value={orderDiscount} onChange={(event) => setOrderDiscount(event.target.value)} />
                  <span>$</span>
                </label>
                <label className="pos-foot-input">
                  <input aria-label="Shipping" type="number" min="0" step="0.01" value={shipping} onChange={(event) => setShipping(event.target.value)} />
                  <span>$</span>
                </label>
              </div>
              <div className="pos-totals">
                <div>Total QTY : <span>{totalQuantity}</span></div>
                <div>Sub Total : <span>{orderTotals ? formatMoney(orderTotals.subtotal) : "—"}</span></div>
                <div className="pos-grand-total">Total : <b>{orderTotals ? formatMoney(orderTotals.grandTotal) : "—"}</b></div>
              </div>
            </div>
            {pricingError && <p className="pos-pricing-error" role="alert">{pricingError}</p>}
            <div className="pos-cart-actions">
              <button className="pos-action pos-hold" type="button" disabled={!cart.length} onClick={holdCurrentOrder}>
                Hold <Hand aria-hidden="true" />
              </button>
              <button
                className="pos-action pos-reset"
                type="button"
                disabled={!cart.length}
                onClick={clearCurrentOrder}
              >
                Reset <RotateCw aria-hidden="true" />
              </button>
              <button
                className="pos-action pos-pay"
                type="button"
                disabled={!cart.length || !orderTotals || Boolean(pricingError) || isSavingSale}
                onClick={openPayment}
              >
                Pay Now <Banknote aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="pos-column" aria-label="Product catalog">
        <div className="pos-toolbar">
          <label className="pos-search-box">
            <Search aria-hidden="true" />
            <input
              aria-label="Search products by code or name"
              placeholder="Scan/Search Product by Code Name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="pos-tools" aria-label="POS tools">
            <button
              className="pos-tool pos-tool-rose"
              type="button"
              aria-label={`Held orders (${heldOrders.length})`}
              aria-haspopup="dialog"
              aria-expanded={isHeldOrdersOpen}
              onClick={() => setIsHeldOrdersOpen(true)}
            >
              <List aria-hidden="true" /><span className="pos-tool-badge">{heldOrders.length}</span>
            </button>
            <button className="pos-tool pos-tool-green" type="button" disabled aria-label="Shopping bag">
              <ShoppingBag aria-hidden="true" />
            </button>
            <button className="pos-tool pos-tool-gold" type="button" disabled aria-label="Fullscreen">
              <Maximize aria-hidden="true" />
            </button>
            <button className="pos-tool pos-tool-gold" type="button" disabled aria-label="Calculator">
              <Calculator aria-hidden="true" />
            </button>
            <button className="pos-tool pos-tool-gold" type="button" disabled aria-label="Gauge">
              <Gauge aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="pos-products">
          <div className="pos-filter-row">
            <label className="pos-filter-select">
              <span className="pos-select-label">Category</span>
              <select
                aria-label="Filter by category"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="all">All Categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" className="pos-select-chevron" />
            </label>
            <label className="pos-filter-select">
              <span className="pos-select-label">Brand</span>
              <select
                aria-label="Filter by brand"
                value={brandId}
                onChange={(event) => setBrandId(event.target.value)}
              >
                <option value="all">All Brands</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>{brand.name}</option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" className="pos-select-chevron" />
            </label>
          </div>

          {loadError && <p className="pos-product-message pos-product-error" role="alert">{loadError}</p>}
          {isLoading && <p className="pos-product-message" role="status">Loading warehouse products...</p>}
          {!isLoading && !loadError && !warehouseId && (
            <p className="pos-product-message">Add a warehouse before using the POS screen.</p>
          )}
          {!isLoading && !loadError && warehouseId && visibleProducts.length === 0 && (
            <p className="pos-product-message">No products match your search and filters.</p>
          )}
          <div className="pos-product-grid" aria-busy={isLoading}>
            {!isLoading && visibleProducts.map((product, index) => {
              const [startColor, endColor] = cardColors[index % cardColors.length];
              const outOfStock = decimalValue(product.stock).lessThanOrEqualTo(0);
              return (
                <article className="pos-product-card" key={product.id}>
                  <button
                    className={`pos-product-select${outOfStock ? " is-out-of-stock" : ""}`}
                    type="button"
                    disabled={outOfStock}
                    onClick={() => addProduct(product)}
                    aria-label={outOfStock ? `${product.name}, out of stock` : `Add ${product.name} to cart`}
                  >
                    <div
                      className="pos-product-art"
                      style={{ backgroundImage: `linear-gradient(140deg, ${startColor}, ${endColor})` }}
                    >
                      {product.image ? (
                        <Image
                          className="pos-product-photo"
                          src={product.image}
                          alt=""
                          width={320}
                          height={220}
                          unoptimized
                        />
                      ) : (
                        <PackageOpen aria-hidden="true" />
                      )}
                      <span className="pos-product-tag pos-product-price">$ {formatPrice(product.price)}</span>
                      <span className="pos-product-tag pos-product-stock">
                        {formatStock(product.stock)} {product.unit}
                      </span>
                      {outOfStock && <span className="pos-product-unavailable">Out of stock</span>}
                    </div>
                    <div className="pos-product-body">
                      <div className="pos-product-name">{product.name}</div>
                      <div className="pos-product-code">{product.code}</div>
                    </div>
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      </section>
      {editingItemId && itemEdit && (
        <PosItemEditModal
          item={cart.find((item) => item.id === editingItemId)}
          edit={itemEdit}
          error={itemEditError}
          onChange={setItemEdit}
          onSave={saveItemEditor}
          onClose={closeItemEditor}
        />
      )}
      {isHeldOrdersOpen && (
        <HeldOrdersModal
          orders={heldOrders}
          activeCustomerName={customerOptions.find((customer) => customer.id === customerId)?.name ?? "Unknown customer"}
          activeWarehouseName={warehouses.find((warehouse) => warehouse.id === warehouseId)?.name ?? "Unknown warehouse"}
          hasActiveCart={cart.length > 0}
          onResume={resumeHeldOrder}
          onDiscard={(heldOrderId) => {
            setHeldOrders((current) => current.filter((order) => order.id !== heldOrderId));
          }}
          onClose={() => setIsHeldOrdersOpen(false)}
        />
      )}
      {isPaymentOpen && orderTotals && (
        <PosPaymentModal
          total={orderTotals.grandTotal}
          tenderedAmount={tenderedAmount}
          paymentType={paymentType}
          changeDue={changeDue}
          error={paymentError || paymentActionError}
          isSaving={isSavingSale}
          onTenderedAmountChange={(value) => {
            setTenderedAmount(value);
            setPaymentError("");
            setPaymentActionError("");
          }}
          onPaymentTypeChange={setPaymentType}
          onSubmit={submitPayment}
          onClose={() => {
            if (!isSavingSale) setIsPaymentOpen(false);
          }}
        />
      )}
      {receipt && (
        <PosReceiptModal
          receipt={receipt}
          onClose={() => setReceipt(null)}
        />
      )}
      {isCustomerModalOpen && (
        <PosCustomerModal
          onCreated={handleCustomerCreated}
          onClose={() => setIsCustomerModalOpen(false)}
        />
      )}
    </main>
  );
}

function PosCustomerModal({
  onCreated,
  onClose,
}: {
  onCreated: (customer: PosOption) => void;
  onClose: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    createPosCustomer,
    initialPosCustomerActionState,
  );
  const [countryCode, setCountryCode] = useState("");
  const [phoneCountrySelection, setPhoneCountrySelection] = useState<{
    countryCode: string;
    version: number;
  } | null>(null);

  useEffect(() => {
    if (state.status === "success") onCreated(state.customer);
  }, [onCreated, state]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isPending, onClose]);

  const fieldError = (field: CustomerField) =>
    state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;

  return (
    <div
      className="pos-held-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) onClose();
      }}
    >
      <section className="gg-modal pos-customer-modal" role="dialog" aria-modal="true" aria-labelledby="pos-customer-modal-title">
        <div className="gg-modal-head">
          <h2 className="gg-card-title" id="pos-customer-modal-title">Add Customer</h2>
          <button className="gg-modal-close" type="button" aria-label="Close customer form" onClick={onClose} disabled={isPending}>
            <X aria-hidden="true" />
          </button>
        </div>
        <form action={formAction} noValidate>
          <div className="pos-customer-modal-body">
            {state.status === "error" && (
              <p className="pos-customer-form-error" role="alert">{state.message}</p>
            )}
            <div className="exp-grid">
              <div className="gg-field">
                <label className="gg-label" htmlFor="pos-customer-name">Name <span className="gg-req">*</span></label>
                <input
                  className="gg-input"
                  id="pos-customer-name"
                  name="name"
                  autoComplete="name"
                  maxLength={120}
                  required
                  aria-invalid={Boolean(fieldError("name"))}
                  disabled={isPending}
                />
                {fieldError("name") && <span className="warehouse-field-error">{fieldError("name")}</span>}
              </div>
              <div className="gg-field">
                <label className="gg-label" htmlFor="pos-customer-email">Email <span className="gg-req">*</span></label>
                <input
                  className="gg-input"
                  id="pos-customer-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={191}
                  required
                  aria-invalid={Boolean(fieldError("email"))}
                  disabled={isPending}
                />
                {fieldError("email") && <span className="warehouse-field-error">{fieldError("email")}</span>}
              </div>
              <PhoneNumberInput
                error={fieldError("phoneNumber")}
                disabled={isPending}
                required
                countryCode={countryCode}
                onCountryCodeChange={(nextCountryCode) => {
                  setPhoneCountrySelection((current) => ({
                    countryCode: nextCountryCode,
                    version: (current?.version ?? 0) + 1,
                  }));
                }}
              />
              <div className="gg-field">
                <label className="gg-label" htmlFor="pos-customer-dob">Date of birth</label>
                <div className="date-field">
                  <input className="gg-input gg-num" id="pos-customer-dob" name="dateOfBirth" type="date" autoComplete="bday" disabled={isPending} />
                  <CalendarDays aria-hidden="true" />
                </div>
                {fieldError("dateOfBirth") && <span className="warehouse-field-error">{fieldError("dateOfBirth")}</span>}
              </div>
              <CountryCityFields
                countryError={fieldError("country")}
                regionError={fieldError("region")}
                cityError={fieldError("city")}
                postalError={fieldError("zipCode")}
                disabled={isPending}
                showRegion
                showPostalCode
                onCountryCodeChange={setCountryCode}
                phoneCountrySelection={phoneCountrySelection}
              />
              <div className="gg-field pos-customer-address">
                <label className="gg-label" htmlFor="pos-customer-address">Address <span className="gg-req">*</span></label>
                <textarea
                  className="gg-textarea"
                  id="pos-customer-address"
                  name="address"
                  maxLength={191}
                  required
                  aria-invalid={Boolean(fieldError("address"))}
                  disabled={isPending}
                />
                {fieldError("address") && <span className="warehouse-field-error">{fieldError("address")}</span>}
              </div>
            </div>
          </div>
          <div className="gg-modal-foot">
            <button className="gg-btn gg-btn--secondary" type="button" onClick={onClose} disabled={isPending}>Cancel</button>
            <button className="gg-btn gg-btn--primary" type="submit" disabled={isPending}>
              <Check aria-hidden="true" />{isPending ? "Saving..." : "Save Customer"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PosPaymentModal({
  total,
  tenderedAmount,
  paymentType,
  changeDue,
  error,
  isSaving,
  onTenderedAmountChange,
  onPaymentTypeChange,
  onSubmit,
  onClose,
}: {
  total: Prisma.Decimal;
  tenderedAmount: string;
  paymentType: string;
  changeDue: Prisma.Decimal | null;
  error: string;
  isSaving: boolean;
  onTenderedAmountChange: (value: string) => void;
  onPaymentTypeChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="pos-held-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <form className="gg-modal pos-payment-modal" role="dialog" aria-modal="true" aria-labelledby="pos-payment-title" onSubmit={onSubmit}>
        <div className="gg-modal-head">
          <h2 className="gg-card-title" id="pos-payment-title">Complete payment</h2>
          <button className="gg-modal-close" type="button" aria-label="Close payment" onClick={onClose} disabled={isSaving}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="pos-payment-body">
          <div className="pos-payment-total">
            <span>Sale total</span>
            <strong>{formatMoney(total)}</strong>
          </div>
          <label className="gg-field">
            <span className="gg-label">Payment type</span>
            <select className="gg-select" value={paymentType} onChange={(event) => onPaymentTypeChange(event.target.value)} disabled={isSaving}>
              {["Cash", "Card", "Bank Transfer", "Other"].map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label className="gg-field">
            <span className="gg-label">Amount tendered</span>
            <div className="gg-input-group">
              <input
                className="gg-input gg-num"
                aria-label="Amount tendered"
                type="number"
                min={total.toFixed(2)}
                step="0.01"
                required
                value={tenderedAmount}
                onChange={(event) => onTenderedAmountChange(event.target.value)}
                disabled={isSaving}
              />
              <span className="gg-input-suffix">$</span>
            </div>
          </label>
          <div className="pos-payment-change">
            <span>Change</span>
            <strong>{changeDue ? formatMoney(changeDue) : "—"}</strong>
          </div>
          {error && <p className="warehouse-field-error" role="alert">{error}</p>}
        </div>
        <div className="gg-modal-foot">
          <button className="gg-btn gg-btn--primary" type="submit" disabled={isSaving}>
            <Banknote aria-hidden="true" />{isSaving ? "Processing..." : "Confirm payment"}
          </button>
          <button className="gg-btn gg-btn--secondary" type="button" onClick={onClose} disabled={isSaving}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function PosReceiptModal({
  receipt,
  onClose,
}: {
  receipt: PosReceipt;
  onClose: () => void;
}) {
  return (
    <>
      <div className="pos-held-overlay" role="presentation">
        <section className="gg-modal pos-receipt-modal" role="dialog" aria-modal="true" aria-labelledby="pos-receipt-title">
          <div className="gg-modal-head">
            <h2 className="gg-card-title" id="pos-receipt-title">Sale completed</h2>
            <button className="gg-modal-close" type="button" aria-label="Close receipt options" onClick={onClose}>
              <X aria-hidden="true" />
            </button>
          </div>
          <div className="pos-receipt-body">
            <CircleCheck aria-hidden="true" />
            <p>Sale <strong>{receipt.reference}</strong> was created successfully.</p>
            <span>The sale is saved and inventory has been updated.</span>
          </div>
          <div className="gg-modal-foot pos-receipt-actions">
            <button className="gg-btn gg-btn--secondary" type="button" onClick={onClose}>Close</button>
            <button className="gg-btn gg-btn--primary" type="button" onClick={() => window.print()}>
              <Check aria-hidden="true" />Print Receipt
            </button>
          </div>
        </section>
      </div>
      <section className="pos-print-receipt" aria-label="Printable sale receipt">
        <header className="pos-print-head">
          <h1>Sales Receipt</h1>
          <strong>{receipt.reference}</strong>
          <span>{receipt.date}</span>
        </header>
        <dl className="pos-print-details">
          <div><dt>Customer</dt><dd>{receipt.customerName}</dd></div>
          <div><dt>Warehouse</dt><dd>{receipt.warehouseName}</dd></div>
          <div><dt>Payment</dt><dd>{receipt.paymentType}</dd></div>
        </dl>
        <table className="pos-print-items">
          <thead>
            <tr><th>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr>
          </thead>
          <tbody>
            {receipt.items.map((item, index) => (
              <tr key={`${item.code}-${index}`}>
                <td>{item.name}<small>{item.code}</small></td>
                <td>{item.quantity} {item.unit}</td>
                <td>{formatMoney(new Prisma.Decimal(item.price))}</td>
                <td>{formatMoney(new Prisma.Decimal(item.subtotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pos-print-total"><span>Total</span><strong>{formatMoney(new Prisma.Decimal(receipt.total))}</strong></div>
        <div className="pos-print-total"><span>Change</span><strong>{formatMoney(new Prisma.Decimal(receipt.change))}</strong></div>
        <p className="pos-print-thanks">Thank you for your purchase.</p>
      </section>
    </>
  );
}

function HeldOrdersModal({
  orders,
  activeCustomerName,
  activeWarehouseName,
  hasActiveCart,
  onResume,
  onDiscard,
  onClose,
}: {
  orders: HeldPosOrder[];
  activeCustomerName: string;
  activeWarehouseName: string;
  hasActiveCart: boolean;
  onResume: (heldOrderId: string) => void;
  onDiscard: (heldOrderId: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="pos-held-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="gg-modal pos-held-modal" role="dialog" aria-modal="true" aria-labelledby="pos-held-title">
        <div className="gg-modal-head">
          <h2 className="gg-card-title" id="pos-held-title">Held orders ({orders.length})</h2>
          <button className="gg-modal-close" type="button" aria-label="Close held orders" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="pos-held-body">
          {hasActiveCart && (
            <p className="pos-held-note">
              Resuming an order will hold your current cart for {activeCustomerName} at {activeWarehouseName}.
            </p>
          )}
          {orders.length === 0 ? (
            <div className="pos-held-empty">
              <Hand aria-hidden="true" />
              <p>No held orders</p>
              <span>Use Hold to park the current cart.</span>
            </div>
          ) : (
            <ul className="pos-held-list">
              {orders.map((order) => (
                <li className="pos-held-order" key={order.id}>
                  <div className="pos-held-order-info">
                    <strong>{order.customerName}</strong>
                    <span>{order.warehouseName}</span>
                    <span>{order.cart.length} {order.cart.length === 1 ? "product" : "products"} · {order.cart.reduce((total, item) => total.plus(decimalValue(item.quantity)), new Prisma.Decimal(0)).toString()} quantity</span>
                    <time dateTime={new Date(order.heldAt).toISOString()}>
                      {new Date(order.heldAt).toLocaleString()}
                    </time>
                  </div>
                  <div className="pos-held-order-actions">
                    <button className="gg-btn gg-btn--primary" type="button" onClick={() => onResume(order.id)}>
                      <ShoppingBag aria-hidden="true" />Resume
                    </button>
                    <button
                      className="gg-icon-btn pos-held-discard"
                      type="button"
                      aria-label={`Discard held order for ${order.customerName}`}
                      onClick={() => onDiscard(order.id)}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function PosItemEditModal({
  item,
  edit,
  error,
  onChange,
  onSave,
  onClose,
}: {
  item?: PosCartItem;
  edit: PosItemEdit;
  error: string;
  onChange: (edit: PosItemEdit) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  if (!item) return null;

  return (
    <div
      className="purchase-item-overlay is-open"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="gg-modal purchase-item-modal" role="dialog" aria-modal="true" aria-labelledby="pos-item-modal-title">
        <div className="gg-modal-head">
          <h2 className="gg-card-title" id="pos-item-modal-title">{item.name}</h2>
          <button className="gg-modal-close" type="button" aria-label="Close product details" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="gg-modal-body purchase-item-modal-body">
          <div className="gg-field">
            <label className="gg-label" htmlFor="pos-item-price">Product Price</label>
            <div className="gg-input-group">
              <input className="gg-input gg-num" id="pos-item-price" type="number" min="0" step="0.01" value={edit.price} onChange={(event) => onChange({ ...edit, price: event.target.value })} />
              <span className="gg-input-suffix">$</span>
            </div>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="pos-item-tax-type">Tax Type</label>
            <select className="gg-select" id="pos-item-tax-type" value={edit.taxType} onChange={(event) => {
              if (event.target.value === "Inclusive" || event.target.value === "Exclusive") onChange({ ...edit, taxType: event.target.value });
            }}>
              <option value="Inclusive">Inclusive</option>
              <option value="Exclusive">Exclusive</option>
            </select>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="pos-item-tax">Product Tax</label>
            <div className="gg-input-group">
              <input className="gg-input gg-num" id="pos-item-tax" type="number" min="0" max="100" step="0.01" value={edit.taxRate} onChange={(event) => onChange({ ...edit, taxRate: event.target.value })} />
              <span className="gg-input-suffix">%</span>
            </div>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="pos-item-discount-type">Discount Type</label>
            <select className="gg-select" id="pos-item-discount-type" value={edit.discountType} onChange={(event) => {
              if (event.target.value === "Fixed" || event.target.value === "Percentage") onChange({ ...edit, discountType: event.target.value });
            }}>
              <option value="Fixed">Fixed</option>
              <option value="Percentage">Percentage</option>
            </select>
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="pos-item-discount">Discount</label>
            <input className="gg-input gg-num" id="pos-item-discount" type="number" min="0" step="0.01" value={edit.discount} onChange={(event) => onChange({ ...edit, discount: event.target.value })} />
          </div>
          {error && <p className="warehouse-field-error" role="alert">{error}</p>}
        </div>
        <div className="gg-modal-foot">
          <button className="gg-btn gg-btn--primary" type="button" onClick={onSave}>
            <Check aria-hidden="true" />Save
          </button>
          <button className="gg-btn gg-btn--secondary" type="button" onClick={onClose}>Cancel</button>
        </div>
      </section>
    </div>
  );
}
