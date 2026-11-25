"use client";

import Image from "next/image";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Prisma } from "@prisma/client";
import type { IScannerControls } from "@zxing/browser";
import {
  Barcode,
  Banknote,
  Camera,
  CalendarDays,
  Check,
  ChevronDown,
  CircleCheck,
  CircleAlert,
  Hand,
  Home,
  List,
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
import useDialogFocus from "@/components/shared/useDialogFocus";
import {
  calculatePurchaseLineTotals,
  calculatePurchaseTotals,
} from "@/lib/purchase-pricing";
import {
  calculateFixedLineDiscount,
  calculateUnitDiscount,
} from "@/lib/product-discount";
import { createProductBarcodeReader } from "@/lib/product-barcode-reader";
import { createSale } from "@/app/(authenticated)/sales/create/actions";
import { initialSaleCreateActionState } from "@/app/(authenticated)/sales/create/action-state";
import { createPosCustomer, loadPosProducts } from "./actions";
import { initialPosCustomerActionState } from "./action-state";
import type { CustomerField } from "@/app/(authenticated)/customers/create/action-state";
import type { PosOption, PosProduct } from "./types";

type PosCartItem = PosProduct & {
  quantity: string;
  discountPerUnit: string | null;
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
  subtotal: string;
  orderTax: string;
  orderTaxRate: string;
  orderDiscount: string;
  shipping: string;
  total: string;
  change: string;
  items: {
    name: string;
    code: string;
    quantity: string;
    unit: string;
    price: string;
    subtotal: string;
    discount: string;
    discountType: "Fixed" | "Percentage";
  }[];
};

const POS_WAREHOUSE_STORAGE_KEY = "inventory-pos-last-warehouse";

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
  initialWarehouseId,
  canCreateCustomers,
}: {
  warehouses: PosOption[];
  customers: PosOption[];
  categories: PosOption[];
  brands: PosOption[];
  initialProducts: PosProduct[];
  initialWarehouseId: string;
  canCreateCustomers: boolean;
}) {
  const [customerId, setCustomerId] = useState("");
  const [customerOptions, setCustomerOptions] = useState(customers);
  const [isCustomerMenuOpen, setIsCustomerMenuOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId);
  const [products, setProducts] = useState(initialProducts);
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [search, setSearch] = useState("");
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("all");
  const [brandId, setBrandId] = useState("all");
  const [loadError, setLoadError] = useState("");
  const [orderTax, setOrderTax] = useState("0.00");
  const [orderDiscount, setOrderDiscount] = useState("0.00");
  const [shipping, setShipping] = useState("0.00");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemEdit, setItemEdit] = useState<PosItemEdit | null>(null);
  const [itemEditError, setItemEditError] = useState("");
  const [cartMessage, setCartMessage] = useState("");
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [heldOrderToDiscard, setHeldOrderToDiscard] = useState<string | null>(null);
  const [heldOrders, setHeldOrders] = useState<HeldPosOrder[]>([]);
  const [isHeldOrdersOpen, setIsHeldOrdersOpen] = useState(false);
  const [isShortcutGuideOpen, setIsShortcutGuideOpen] = useState(false);
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
  const productSearchRef = useRef<HTMLInputElement>(null);
  const mobileCartRef = useRef<HTMLDivElement>(null);
  const customerMenuRef = useRef<HTMLDivElement>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);
  const pendingReceiptRef = useRef<Omit<PosReceipt, "saleId" | "reference"> | null>(null);
  const requestId = useRef(0);
  const lastLoadedWarehouseId = useRef(initialWarehouseId);
  const barcodeBuffer = useRef("");
  const lastBarcodeKeyAt = useRef(0);

  useEffect(() => {
    try {
      const savedWarehouseId = window.localStorage.getItem(POS_WAREHOUSE_STORAGE_KEY);
      if (savedWarehouseId && warehouses.some((warehouse) => warehouse.id === savedWarehouseId)) {
        setWarehouseId(savedWarehouseId);
      }
    } catch (error) {
      console.error("Saved POS warehouse could not be loaded.", error);
    }
  }, [warehouses]);

  useDialogFocus(mobileCartRef, isMobileCartOpen);

  const handleCustomerCreated = useCallback((customer: PosOption) => {
    setCustomerOptions((current) => [...current, customer]);
    setCustomerId(customer.id);
    setCartMessage("");
    setIsCustomerMenuOpen(false);
    setIsCustomerModalOpen(false);
  }, []);

  const [saleDate] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });

  const clearCurrentOrder = useCallback(() => {
    setCart([]);
    setOrderTax("0.00");
    setOrderDiscount("0.00");
    setShipping("0.00");
    setEditingItemId(null);
    setItemEdit(null);
    setItemEditError("");
  }, []);

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
    if (!isShortcutGuideOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsShortcutGuideOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isShortcutGuideOpen]);

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
    if (!isCustomerMenuOpen) return;

    customerSearchRef.current?.focus();
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !customerMenuRef.current?.contains(event.target)) {
        setIsCustomerMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsCustomerMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCustomerMenuOpen]);

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
  }, [clearCurrentOrder, saleActionState, startLoading, warehouseId]);

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
  const visibleCustomers = useMemo(() => {
    const query = customerSearch.trim().toLocaleLowerCase();
    return customerOptions.filter((customer) =>
      !query || customer.name.toLocaleLowerCase().includes(query),
    );
  }, [customerOptions, customerSearch]);

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

  const addProduct = useCallback((product: PosProduct) => {
    const availableStock = decimalValue(product.stock);
    if (availableStock.isZero() || availableStock.isNegative()) {
      setCartMessage(`${product.name} is out of stock at this warehouse.`);
      return false;
    }

    const existingItem = cart.find((item) => item.id === product.id);
    if (existingItem && availableStock.lessThanOrEqualTo(decimalValue(existingItem.quantity))) {
      setCartMessage(`Only ${formatStock(product.stock)} ${product.unit} available for ${product.name}.`);
      return false;
    }

    setCartMessage("");
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        const currentQuantity = decimalValue(existing.quantity);
        const remainingStock = availableStock.minus(currentQuantity);
        if (remainingStock.isZero() || remainingStock.isNegative()) return current;
        const increment = Prisma.Decimal.min(remainingStock, new Prisma.Decimal(1));
        const nextQuantity = currentQuantity.plus(increment);
        return current.map((item) => {
          if (item.id !== product.id) return item;
          return {
            ...item,
            quantity: nextQuantity.toString(),
            ...(item.discountType === "Fixed" && item.discountPerUnit !== null
              ? { discount: calculateFixedLineDiscount(item.discountPerUnit, nextQuantity).toFixed(2) }
              : {}),
          };
        });
      }
      const quantity = Prisma.Decimal.min(availableStock, new Prisma.Decimal(1));
      return [...current, {
        ...product,
        quantity: quantity.toString(),
        discount: product.discountType === "Fixed"
          ? calculateFixedLineDiscount(product.discount, quantity).toFixed(2)
          : product.discount,
        discountPerUnit: product.discountType === "Fixed" ? product.discount : null,
      }];
    });
    return true;
  }, [cart]);

  const addScannedProduct = useCallback((rawCode: string) => {
    const code = rawCode.trim().toLocaleLowerCase();
    if (!code) return false;
    const product = products.find((item) => item.code.trim().toLocaleLowerCase() === code);
    if (!product) {
      setCartMessage(`No product code matches “${rawCode.trim()}”.`);
      setSearch(rawCode.trim());
      return false;
    }
    const added = addProduct(product);
    setSearch("");
    return added;
  }, [addProduct, products]);

  function changeQuantity(productId: string, delta: number) {
    setCart((current) => current.map((item) => {
      if (item.id !== productId) return item;
      const currentQuantity = decimalValue(item.quantity);
      const availableStock = decimalValue(item.stock);
      if (delta > 0) {
        const remainingStock = availableStock.minus(currentQuantity);
        if (remainingStock.isZero() || remainingStock.isNegative()) return item;
        const increment = Prisma.Decimal.min(remainingStock, new Prisma.Decimal(delta));
        const quantity = currentQuantity.plus(increment);
        return {
          ...item,
          quantity: quantity.toString(),
          ...(item.discountType === "Fixed" && item.discountPerUnit !== null
            ? { discount: calculateFixedLineDiscount(item.discountPerUnit, quantity).toFixed(2) }
            : {}),
        };
      }
      const quantity = currentQuantity.plus(delta);
      return quantity.greaterThan(0)
        ? {
          ...item,
          quantity: quantity.toString(),
          ...(item.discountType === "Fixed" && item.discountPerUnit !== null
            ? { discount: calculateFixedLineDiscount(item.discountPerUnit, quantity).toFixed(2) }
            : {}),
        }
        : item;
    }));
  }

  function setItemQuantity(productId: string, value: string) {
    if (!/^\d{1,9}(?:\.\d{0,3})?$/.test(value)) return;
    let quantity: Prisma.Decimal;
    try {
      quantity = new Prisma.Decimal(value);
    } catch {
      return;
    }
    if (!quantity.isFinite() || quantity.isZero() || quantity.isNegative()) return;

    const item = cart.find((entry) => entry.id === productId);
    if (!item) return;
    if (quantity.greaterThan(decimalValue(item.stock))) {
      setCartMessage(`Only ${formatStock(item.stock)} ${item.unit} available for ${item.name}.`);
      return;
    }
    setCartMessage("");
    setCart((current) => current.map((entry) => (
      entry.id === productId
        ? {
          ...entry,
          quantity: quantity.toString(),
          ...(entry.discountType === "Fixed" && entry.discountPerUnit !== null
            ? { discount: calculateFixedLineDiscount(entry.discountPerUnit, quantity).toFixed(2) }
            : {}),
        }
        : entry
    )));
  }

  const makeHeldOrder = useCallback((): HeldPosOrder => {
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
  }, [cart, customerId, customerOptions, orderDiscount, orderTax, shipping, warehouseId, warehouses]);

  const openPayment = useCallback(() => {
    if (!cart.length || !orderTotals || pricingError) return;
    if (!customerId) {
      setCartMessage("Select a customer before payment.");
      setCustomerSearch("");
      setIsCustomerMenuOpen(true);
      customerMenuRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setTenderedAmount(orderTotals.grandTotal.toFixed(2));
    setPaymentError("");
    setPaymentActionError("");
    setIsPaymentOpen(true);
  }, [cart.length, customerId, orderTotals, pricingError]);

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
      subtotal: orderTotals.subtotal.toFixed(2),
      orderTax: orderTotals.orderTax.toFixed(2),
      orderTaxRate: orderTax,
      orderDiscount: orderTotals.discount.toFixed(2),
      shipping: orderTotals.shipping.toFixed(2),
      total: orderTotals.grandTotal.toFixed(2),
      change: changeDue?.toFixed(2) ?? "0.00",
      items: cart.map((item) => ({
        name: item.name,
        code: item.code,
        quantity: item.quantity,
        unit: item.unit,
        price: item.price,
        subtotal: lineTotals.get(item.id)?.subtotal.toFixed(2) ?? "0.00",
        discount: item.discount,
        discountType: item.discountType,
      })),
    };
    setPaymentError("");
    setPaymentActionError("");
    saleFormRef.current.requestSubmit();
  }

  const holdCurrentOrder = useCallback(() => {
    if (!cart.length) return;
    const heldOrder = makeHeldOrder();
    setHeldOrders((current) => [heldOrder, ...current]);
    clearCurrentOrder();
  }, [cart.length, clearCurrentOrder, makeHeldOrder]);

  useEffect(() => {
    function handleShortcuts(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const isEditingText = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));

      if (event.key === "Escape") {
        if (isCameraScannerOpen) setIsCameraScannerOpen(false);
        if (isResetConfirmOpen) setIsResetConfirmOpen(false);
        if (isShortcutGuideOpen) setIsShortcutGuideOpen(false);
        if (isMobileCartOpen) setIsMobileCartOpen(false);
        return;
      }
      if (isEditingText) {
        if (event.key === "F7") {
          event.preventDefault();
          setSearch("");
          productSearchRef.current?.focus();
        }
        return;
      }
      if (
        isCameraScannerOpen || isCustomerMenuOpen || isCustomerModalOpen
        || isHeldOrdersOpen || isShortcutGuideOpen || isMobileCartOpen
        || isPaymentOpen || isResetConfirmOpen || receipt
      ) return;

      switch (event.key) {
        case "F1":
          event.preventDefault();
          setIsShortcutGuideOpen(true);
          break;
        case "F2":
          event.preventDefault();
          productSearchRef.current?.focus();
          break;
        case "F3":
          event.preventDefault();
          setIsCameraScannerOpen(true);
          break;
        case "F4":
          event.preventDefault();
          setCustomerSearch("");
          setIsCustomerMenuOpen(true);
          break;
        case "F5":
          event.preventDefault();
          if (cart.length) setIsResetConfirmOpen(true);
          break;
        case "F6":
          event.preventDefault();
          setIsHeldOrdersOpen(true);
          break;
        case "F7":
          event.preventDefault();
          setSearch("");
          productSearchRef.current?.focus();
          break;
        case "F8":
          event.preventDefault();
          holdCurrentOrder();
          break;
        case "F9":
          event.preventDefault();
          openPayment();
          break;
        default:
          break;
      }
    }

    document.addEventListener("keydown", handleShortcuts);
    return () => document.removeEventListener("keydown", handleShortcuts);
  }, [cart.length, holdCurrentOrder, isCameraScannerOpen, isCustomerMenuOpen, isCustomerModalOpen, isHeldOrdersOpen, isShortcutGuideOpen, isMobileCartOpen, isPaymentOpen, isResetConfirmOpen, openPayment, receipt]);

  useEffect(() => {
    function handleHidBarcode(event: KeyboardEvent) {
      if (isCameraScannerOpen || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        barcodeBuffer.current = "";
        return;
      }

      if (event.key === "Enter") {
        const code = barcodeBuffer.current;
        barcodeBuffer.current = "";
        if (code.length < 4) return;
        const product = products.find((item) => item.code.trim().toLocaleLowerCase() === code.toLocaleLowerCase());
        if (product) {
          event.preventDefault();
          addProduct(product);
        } else {
          setCartMessage(`No product code matches “${code}”.`);
        }
        return;
      }

      if (event.key.length !== 1 || !/^[\w-]$/.test(event.key)) return;
      const now = performance.now();
      if (now - lastBarcodeKeyAt.current > 80) barcodeBuffer.current = "";
      barcodeBuffer.current += event.key;
      lastBarcodeKeyAt.current = now;
    }

    document.addEventListener("keydown", handleHidBarcode);
    return () => document.removeEventListener("keydown", handleHidBarcode);
  }, [addProduct, isCameraScannerOpen, products]);

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
    if (heldOrder.warehouseId !== warehouseId) selectWarehouse(heldOrder.warehouseId);
    setIsHeldOrdersOpen(false);
  }

  function selectWarehouse(nextWarehouseId: string) {
    setWarehouseId(nextWarehouseId);
    try {
      window.localStorage.setItem(POS_WAREHOUSE_STORAGE_KEY, nextWarehouseId);
    } catch (error) {
      console.error("POS warehouse selection could not be saved.", error);
    }
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
      item.id === editingItemId
        ? {
          ...item,
          ...itemEdit,
          discountPerUnit: itemEdit.discountType === "Fixed"
            && item.discountType === "Fixed"
            && item.discount === itemEdit.discount
            ? item.discountPerUnit
            : null,
        }
        : item
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
            <div className="pos-customer-select" ref={customerMenuRef}>
              <span className="pos-select-label">Customer</span>
              <button
                className="pos-customer-trigger"
                type="button"
                aria-label={`Customer: ${customerOptions.find((customer) => customer.id === customerId)?.name ?? "Select customer"}`}
                aria-haspopup="listbox"
                aria-expanded={isCustomerMenuOpen}
                onClick={() => {
                  setCustomerSearch("");
                  setIsCustomerMenuOpen((open) => !open);
                }}
              >
                <span>{customerOptions.find((customer) => customer.id === customerId)?.name ?? "Select customer"}</span>
                <ChevronDown aria-hidden="true" />
              </button>
              {isCustomerMenuOpen && (
                <div className="pos-customer-menu">
                  <label className="pos-customer-search">
                    <Search aria-hidden="true" />
                    <input
                      ref={customerSearchRef}
                      type="search"
                      role="searchbox"
                      aria-label="Search customers"
                      placeholder="Search customers"
                      value={customerSearch}
                      onChange={(event) => setCustomerSearch(event.target.value)}
                    />
                  </label>
                  <div className="pos-customer-options" role="listbox" aria-label="Customers">
                    {visibleCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        role="option"
                        aria-selected={customer.id === customerId}
                        className={customer.id === customerId ? "is-selected" : ""}
                        onClick={() => {
                          setCustomerId(customer.id);
                          setCartMessage("");
                          setIsCustomerMenuOpen(false);
                        }}
                      >
                        {customer.name}
                        {customer.id === customerId && <Check aria-hidden="true" />}
                      </button>
                    ))}
                    {visibleCustomers.length === 0 && <p className="pos-customer-no-results">No matching customers.</p>}
                  </div>
                  {canCreateCustomers && (
                    <button
                      className="pos-customer-menu-add"
                      type="button"
                      onClick={() => {
                        setIsCustomerMenuOpen(false);
                        setIsCustomerModalOpen(true);
                      }}
                    >
                      <Plus aria-hidden="true" />Add new customer
                    </button>
                  )}
                </div>
              )}
            </div>
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
                    selectWarehouse(event.target.value);
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

        <div
          className={`pos-cart${isMobileCartOpen ? " is-mobile-open" : ""}`}
          id="pos-cart-panel"
          ref={mobileCartRef}
          role={isMobileCartOpen ? "dialog" : undefined}
          aria-modal={isMobileCartOpen || undefined}
          aria-labelledby="pos-cart-title"
          tabIndex={isMobileCartOpen ? -1 : undefined}
        >
          <div className="pos-cart-titlebar">
            <div>
              <h2 id="pos-cart-title">Current sale</h2>
              <span>{cart.length} {cart.length === 1 ? "item" : "items"} · {totalQuantity} units</span>
            </div>
            <span className="pos-cart-shortcut">F8 Hold · F9 Pay</span>
            <button
              className="pos-mobile-cart-close"
              type="button"
              aria-label="Close current sale"
              onClick={() => setIsMobileCartOpen(false)}
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <div className="pos-cart-head">
            <span>Product</span><span>Qty</span><span>Price</span><span>Sub Total</span><span />
          </div>
          <div className="pos-cart-body">
            {cart.length === 0 ? (
              <div className="pos-cart-empty">
                <PackageOpen aria-hidden="true" />
                <p>Your cart is empty</p>
                <span>Scan or select products to begin.</span>
              </div>
            ) : cart.map((item) => {
              const totals = lineTotals.get(item.id);
              return (
                <div className="pos-cart-row" key={item.id}>
                  <div className="pos-cart-product">
                    <div className="pos-cart-thumb">
                      {item.image
                        ? <Image src={item.image} alt="" width={44} height={44} unoptimized />
                        : <PackageOpen aria-hidden="true" />}
                    </div>
                    <div className="pos-cart-product-info">
                      <div className="pos-cart-product-name" title={item.name}>{item.name}</div>
                    <div className="pos-cart-product-meta">
                      <span className="pos-cart-code">{item.code}</span>
                      {decimalValue(item.discount).greaterThan(0) && (
                        <span className="pos-cart-discount-hint">
                          {item.discountType === "Fixed"
                            ? `$ ${formatPrice(item.discount)} off`
                            : `${formatPrice(item.discount)}% off`}
                        </span>
                      )}
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
                    <input
                      className="pos-stepper-quantity"
                      aria-label={`Quantity for ${item.name}`}
                      type="number"
                      min="0.001"
                      max={item.stock}
                      step="0.001"
                      value={item.quantity}
                      onChange={(event) => setItemQuantity(item.id, event.target.value)}
                    />
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
            {cartMessage && <p className="pos-cart-message" role="status">{cartMessage}</p>}
            <div className="pos-foot-grid">
              <div className="pos-foot-fields" aria-label="Sale adjustments">
                <label className="pos-foot-input">
                  <span className="pos-foot-label">Tax rate</span>
                  <span className="pos-foot-control">
                    <input type="number" min="0" max="100" step="0.01" value={orderTax} onChange={(event) => setOrderTax(event.target.value)} />
                    <span className="pos-foot-unit" aria-hidden="true">%</span>
                  </span>
                </label>
                <label className="pos-foot-input">
                  <span className="pos-foot-label">Discount amount</span>
                  <span className="pos-foot-control">
                    <input type="number" min="0" step="0.01" value={orderDiscount} onChange={(event) => setOrderDiscount(event.target.value)} />
                    <span className="pos-foot-unit" aria-hidden="true">$</span>
                  </span>
                </label>
                <label className="pos-foot-input">
                  <span className="pos-foot-label">Shipping amount</span>
                  <span className="pos-foot-control">
                    <input type="number" min="0" step="0.01" value={shipping} onChange={(event) => setShipping(event.target.value)} />
                    <span className="pos-foot-unit" aria-hidden="true">$</span>
                  </span>
                </label>
              </div>
              <div className="pos-totals">
                <div>Subtotal <span>{orderTotals ? formatMoney(orderTotals.subtotal) : "—"}</span></div>
                <div>Tax <span>{orderTotals ? formatMoney(orderTotals.orderTax) : "—"}</span></div>
                <div>Discount <span>− {orderTotals ? formatMoney(orderTotals.discount) : "—"}</span></div>
                <div>Shipping <span>{orderTotals ? formatMoney(orderTotals.shipping) : "—"}</span></div>
                <div className="pos-grand-total">Grand total <b>{orderTotals ? formatMoney(orderTotals.grandTotal) : "—"}</b></div>
              </div>
            </div>
            {pricingError && <p className="pos-pricing-error" role="alert">{pricingError}</p>}
            <div className="pos-cart-actions">
              <button className="pos-action pos-hold" type="button" disabled={!cart.length} onClick={holdCurrentOrder}>
                Hold <Hand aria-hidden="true" /><kbd>F8</kbd>
              </button>
              <button
                className="pos-action pos-reset"
                type="button"
                disabled={!cart.length}
                onClick={() => setIsResetConfirmOpen(true)}
              >
                Reset cart <RotateCw aria-hidden="true" /><kbd>F5</kbd>
              </button>
              <button
                className="pos-action pos-pay"
                type="button"
                disabled={!cart.length || !orderTotals || Boolean(pricingError) || isSavingSale}
                onClick={openPayment}
              >
                Pay Now <Banknote aria-hidden="true" /><kbd>F9</kbd>
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
              ref={productSearchRef}
              aria-label="Search products by name, SKU, or barcode"
              placeholder="Search by name, SKU, or scan a barcode"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                const query = search.trim().toLocaleLowerCase();
                const exactMatches = products.filter((product) =>
                  product.code.toLocaleLowerCase() === query
                  || product.name.toLocaleLowerCase() === query,
                );
                if (exactMatches.length !== 1) return;
                event.preventDefault();
                addProduct(exactMatches[0]);
                setSearch("");
              }}
            />
            <span className="pos-search-shortcut">F2</span>
            <button
              className="pos-camera-scan"
              type="button"
              aria-label="Scan barcode with camera"
              title="Scan barcode with camera (F3)"
              onClick={() => setIsCameraScannerOpen(true)}
            >
              <Camera aria-hidden="true" /><span>Scan</span><kbd>F3</kbd>
            </button>
          </label>
          <div className="pos-tools" aria-label="POS tools">
            <button
              className="pos-tool pos-tool-rose"
              type="button"
              aria-label={`Held orders (${heldOrders.length})`}
              aria-haspopup="dialog"
              aria-expanded={isHeldOrdersOpen}
              title="Held orders (F6)"
              onClick={() => setIsHeldOrdersOpen(true)}
            >
              <List aria-hidden="true" /><span className="pos-tool-badge">{heldOrders.length}</span>
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
          {cartMessage && <p className="pos-product-message" role="status">{cartMessage}</p>}
          {isLoading && <p className="pos-product-message" role="status">Loading warehouse products...</p>}
          {!isLoading && !loadError && !warehouseId && (
            <p className="pos-product-message">Add a warehouse before using the POS screen.</p>
          )}
          {!isLoading && !loadError && warehouseId && visibleProducts.length === 0 && (
            <p className="pos-product-message">No products match your search and filters.</p>
          )}
          <div className="pos-product-grid" aria-busy={isLoading}>
            {!isLoading && visibleProducts.map((product) => {
              const stock = decimalValue(product.stock);
              const outOfStock = decimalValue(product.stock).lessThanOrEqualTo(0);
              const lowStock = !outOfStock
                && product.stockAlert !== null
                && decimalValue(product.stockAlert).greaterThan(0)
                && stock.lessThanOrEqualTo(decimalValue(product.stockAlert));
              const unitDiscount = calculateUnitDiscount(
                product.price,
                product.discountType,
                product.discount,
              );
              const hasDiscount = unitDiscount.greaterThan(0);
              const salePrice = decimalValue(product.price).minus(unitDiscount).toString();
              return (
                <article className="pos-product-card" key={product.id}>
                  <button
                    className={`pos-product-select${outOfStock ? " is-out-of-stock" : ""}`}
                    type="button"
                    disabled={outOfStock}
                    onClick={() => addProduct(product)}
                    aria-label={outOfStock ? `${product.name}, out of stock` : `Add ${product.name} to cart`}
                  >
                    <div className="pos-product-art">
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
                      <span className={`pos-product-tag pos-product-price${hasDiscount ? " is-discounted" : ""}`}>
                        {hasDiscount ? (
                          <>
                            <del>$ {formatPrice(product.price)}</del>
                            <strong>$ {formatPrice(salePrice)}</strong>
                          </>
                        ) : `$ ${formatPrice(product.price)}`}
                      </span>
                      <span className={`pos-product-tag pos-product-stock${outOfStock ? " is-unavailable" : lowStock ? " is-low" : ""}`}>
                        {formatStock(product.stock)} {product.unit}
                      </span>
                      {(outOfStock || lowStock) && (
                        <span className={`pos-product-status${outOfStock ? " is-unavailable" : " is-low"}`}>
                          {outOfStock ? "Out of stock" : "Low stock"}
                        </span>
                      )}
                    </div>
                    <div className="pos-product-body">
                      <div className="pos-product-name">{product.name}</div>
                      <div className="pos-product-meta">
                        <span className="pos-product-code">{product.code}</span>
                        <span className="pos-product-available">{outOfStock ? "Unavailable" : `${formatStock(product.stock)} ${product.unit} available`}</span>
                      </div>
                    </div>
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      </section>
      {isMobileCartOpen && (
        <button
          className="pos-mobile-cart-backdrop"
          type="button"
          aria-label="Close current sale"
          onClick={() => setIsMobileCartOpen(false)}
        />
      )}
      <div className="pos-mobile-dock" aria-label="Current sale actions">
        <div className="pos-mobile-dock-summary">
          <span>{cart.length} {cart.length === 1 ? "item" : "items"} · {totalQuantity} {totalQuantity === "1" ? "unit" : "units"}</span>
          <strong>{orderTotals ? formatMoney(orderTotals.grandTotal) : "—"}</strong>
        </div>
        <div className="pos-mobile-dock-actions">
          <button
            type="button"
            className="pos-mobile-dock-cart"
            aria-controls="pos-cart-panel"
            aria-expanded={isMobileCartOpen}
            onClick={() => setIsMobileCartOpen((open) => !open)}
          >
            <ShoppingBag aria-hidden="true" />Cart
          </button>
          <button
            type="button"
            className="pos-mobile-dock-hold"
            disabled={!cart.length}
            onClick={() => {
              holdCurrentOrder();
              setIsMobileCartOpen(false);
            }}
          >
            <Hand aria-hidden="true" />Hold
          </button>
          <button
            type="button"
            className="pos-mobile-dock-pay"
            disabled={!cart.length || !orderTotals || Boolean(pricingError) || isSavingSale}
            onClick={() => {
              openPayment();
              setIsMobileCartOpen(false);
            }}
          >
            <Banknote aria-hidden="true" />Pay
          </button>
        </div>
      </div>
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
          onDiscard={setHeldOrderToDiscard}
          onClose={() => setIsHeldOrdersOpen(false)}
        />
      )}
      {isShortcutGuideOpen && (
        <PosShortcutGuideModal onClose={() => setIsShortcutGuideOpen(false)} />
      )}
      {isResetConfirmOpen && (
        <PosConfirmModal
          title="Reset current cart?"
          message="This removes all products and sale adjustments from the current cart. Held orders are not affected."
          confirmLabel="Reset cart"
          onConfirm={() => {
            clearCurrentOrder();
            setCartMessage("");
            setIsResetConfirmOpen(false);
          }}
          onClose={() => setIsResetConfirmOpen(false)}
        />
      )}
      {heldOrderToDiscard && (
        <PosConfirmModal
          title="Discard held order?"
          message="This held order will be permanently removed from this POS session."
          confirmLabel="Discard order"
          onConfirm={() => {
            setHeldOrders((current) => current.filter((order) => order.id !== heldOrderToDiscard));
            setHeldOrderToDiscard(null);
          }}
          onClose={() => setHeldOrderToDiscard(null)}
        />
      )}
      {isCameraScannerOpen && (
        <PosBarcodeScannerModal
          onDetected={(code) => {
            const added = addScannedProduct(code);
            if (added) setIsCameraScannerOpen(false);
            return added;
          }}
          onClose={() => setIsCameraScannerOpen(false)}
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

function PosConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef);

  return (
    <div className="pos-held-overlay" role="presentation">
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="gg-modal pos-confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="pos-confirm-title"
        aria-describedby="pos-confirm-message"
      >
        <div className="gg-modal-head">
          <h2 className="gg-card-title" id="pos-confirm-title">{title}</h2>
          <button className="gg-modal-close" type="button" aria-label="Close confirmation" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="gg-modal-body">
          <p id="pos-confirm-message">{message}</p>
        </div>
        <div className="gg-modal-foot">
          <button className="gg-btn gg-btn--secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="gg-btn pos-confirm-danger" type="button" onClick={onConfirm}>
            <Trash2 aria-hidden="true" />{confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function PosBarcodeScannerModal({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState("");
  const [scannedCode, setScannedCode] = useState("");
  useDialogFocus(dialogRef);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let controls: IScannerControls | null = null;
    let cancelled = false;
    let finished = false;
    const reader = createProductBarcodeReader();
    const startupTimer = window.setTimeout(() => {
      if (cancelled) return;

      void reader.decodeFromVideoDevice(undefined, video, (result) => {
        if (!result || cancelled || finished) return;
        const code = result.getText();
        setScannedCode(code);
        if (onDetectedRef.current(code)) {
          finished = true;
          controls?.stop();
        } else {
          setError(`No available product matches “${code}”. Try another barcode or search by name.`);
        }
      }).then((nextControls) => {
        controls = nextControls;
        if (cancelled || finished) controls.stop();
      }).catch((cameraError: unknown) => {
        if (cancelled) return;
        setError(cameraError instanceof Error
          ? `Could not start the camera: ${cameraError.message}`
          : "Could not start the camera. Check camera permissions and try again.");
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(startupTimer);
      controls?.stop();
    };
  }, []);

  return (
    <div className="pos-held-overlay" role="presentation">
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="gg-modal pos-scanner-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-scanner-title"
      >
        <div className="gg-modal-head">
          <div className="pos-scanner-heading">
            <span><Barcode aria-hidden="true" /></span>
            <div>
              <h2 className="gg-card-title" id="pos-scanner-title">Scan a barcode</h2>
              <p>Point the camera at a product barcode.</p>
            </div>
          </div>
          <button className="gg-modal-close" type="button" aria-label="Close barcode scanner" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="pos-scanner-body">
          <video ref={videoRef} autoPlay muted playsInline aria-label="Camera barcode scanning preview" />
          {!error && !scannedCode && <p className="pos-scanner-hint"><Camera aria-hidden="true" /> Waiting for a barcode…</p>}
          {error && <p className="pos-scanner-error" role="alert"><CircleAlert aria-hidden="true" />{error}</p>}
          {scannedCode && !error && <p className="pos-scanner-hint" role="status">Barcode detected: {scannedCode}</p>}
        </div>
        <div className="gg-modal-foot">
          <button className="gg-btn gg-btn--secondary" type="button" onClick={onClose}>Close scanner</button>
        </div>
      </section>
    </div>
  );
}

function PosCustomerModal({
  onCreated,
  onClose,
}: {
  onCreated: (customer: PosOption) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
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
  useDialogFocus(dialogRef);

  return (
    <div
      className="pos-held-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) onClose();
      }}
    >
      <section ref={dialogRef} tabIndex={-1} className="gg-modal pos-customer-modal" role="dialog" aria-modal="true" aria-labelledby="pos-customer-modal-title">
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
                addressError={fieldError("address")}
                addressDataError={fieldError("addressData")}
                disabled={isPending}
                showRegion
                showPostalCode
                onCountryCodeChange={setCountryCode}
                phoneCountrySelection={phoneCountrySelection}
              />
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
  const dialogRef = useRef<HTMLFormElement>(null);
  useDialogFocus(dialogRef);

  return (
    <div
      className="pos-held-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <form ref={dialogRef} tabIndex={-1} className="gg-modal pos-payment-modal" role="dialog" aria-modal="true" aria-labelledby="pos-payment-title" onSubmit={onSubmit}>
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
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef);

  return (
    <>
      <div className="pos-held-overlay" role="presentation">
        <section ref={dialogRef} tabIndex={-1} className="gg-modal pos-receipt-modal" role="dialog" aria-modal="true" aria-labelledby="pos-receipt-title">
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
          <div className="pos-print-brand-block">
            <div className="pos-print-brand"><span aria-hidden="true">W</span><strong>thewarehouse</strong></div>
            <p>{receipt.warehouseName}</p>
          </div>
          <div className="pos-print-title">
            <h1>Sales Invoice</h1>
            <strong>{receipt.reference}</strong>
            <span>{receipt.date}</span>
            <span className="pos-print-paid">PAID</span>
          </div>
        </header>
        <dl className="pos-print-details">
          <div><dt>Bill to</dt><dd>{receipt.customerName}</dd></div>
          <div><dt>Store</dt><dd>{receipt.warehouseName}</dd></div>
          <div><dt>Payment type</dt><dd>{receipt.paymentType}</dd></div>
        </dl>
        <table className="pos-print-items">
          <thead>
            <tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Discount</th><th>Amount</th></tr>
          </thead>
          <tbody>
            {receipt.items.map((item, index) => (
              <tr key={`${item.code}-${index}`}>
                <td><strong>{item.name}</strong><small>SKU: {item.code}</small></td>
                <td>{item.quantity} {item.unit}</td>
                <td>{formatMoney(new Prisma.Decimal(item.price))}</td>
                <td>{item.discountType === "Fixed"
                  ? formatMoney(new Prisma.Decimal(item.discount))
                  : `${formatPrice(item.discount)}%`}</td>
                <td>{formatMoney(new Prisma.Decimal(item.subtotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pos-print-summary">
          <p>Thank you for your purchase.</p>
          <div>
            <div className="pos-print-total"><span>Subtotal</span><strong>{formatMoney(new Prisma.Decimal(receipt.subtotal))}</strong></div>
            <div className="pos-print-total"><span>Tax ({formatPrice(receipt.orderTaxRate)}%)</span><strong>{formatMoney(new Prisma.Decimal(receipt.orderTax))}</strong></div>
            <div className="pos-print-total"><span>Discount</span><strong>− {formatMoney(new Prisma.Decimal(receipt.orderDiscount))}</strong></div>
            <div className="pos-print-total"><span>Shipping</span><strong>{formatMoney(new Prisma.Decimal(receipt.shipping))}</strong></div>
            <div className="pos-print-total pos-print-grand"><span>Invoice total</span><strong>{formatMoney(new Prisma.Decimal(receipt.total))}</strong></div>
            <div className="pos-print-total"><span>Change</span><strong>{formatMoney(new Prisma.Decimal(receipt.change))}</strong></div>
          </div>
        </div>
        <footer className="pos-print-thanks">Thank you for your business. <span>{receipt.reference}</span></footer>
      </section>
    </>
  );
}

function PosShortcutGuideModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef);

  const shortcuts = [
    ["F1", "Open this shortcut guide"],
    ["F2", "Focus product search"],
    ["F3", "Open camera barcode scanner"],
    ["F4", "Open customer selector"],
    ["F5", "Reset the current cart"],
    ["F6", "Open held orders"],
    ["F7", "Clear product search"],
    ["F8", "Hold the current sale"],
    ["F9", "Open payment"],
    ["Esc", "Close the active dialog"],
  ];

  return (
    <div className="pos-held-overlay" role="presentation">
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="gg-modal pos-shortcut-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-shortcut-title"
      >
        <div className="gg-modal-head">
          <h2 className="gg-card-title" id="pos-shortcut-title">POS shortcuts</h2>
          <button className="gg-modal-close" type="button" aria-label="Close POS shortcuts" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="pos-shortcut-grid">
          {shortcuts.map(([key, label]) => (
            <div className="pos-shortcut-row" key={key}>
              <kbd>{key}</kbd>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="gg-modal-foot">
          <button className="gg-btn gg-btn--primary" type="button" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
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
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef);

  return (
    <div
      className="pos-held-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section ref={dialogRef} tabIndex={-1} className="gg-modal pos-held-modal" role="dialog" aria-modal="true" aria-labelledby="pos-held-title">
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
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef);
  if (!item) return null;

  return (
    <div
      className="purchase-item-overlay is-open"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section ref={dialogRef} tabIndex={-1} className="gg-modal purchase-item-modal" role="dialog" aria-modal="true" aria-labelledby="pos-item-modal-title">
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
