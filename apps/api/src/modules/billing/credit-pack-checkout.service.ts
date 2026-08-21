import { randomUUID } from "node:crypto";
import { Prisma, prisma, type CreditPackPurchase } from "@ai-music/db";
import {
  FLITT_PAYMENT_PROVIDER,
  FxConversionError,
  FxQuoteUnavailableError,
  appendPurchaseIdToReturnUrl,
  buildCreditPackPurchaseDescription,
  convertUsdMajorToGel,
  createUsdGelFxProvider,
  getCreditPackage,
  getCreditPackagePriceUsd,
  isPurchasableCreditPackageId,
  type CreateCreditPackCheckoutInput,
  type CreditPackCheckoutStatus,
  type CreditPackPricingFxQuote,
  type FxQuote,
  type FxRateProvider,
  type PurchasableCreditPackageId,
} from "@ai-music/shared";
import {
  AppError,
  BadRequestError,
  NotFoundError,
  ServiceUnavailableError,
} from "../../common/errors.js";
import {
  FlittCheckoutError,
  FlittPaymentProvider,
  assertFlittCheckoutEnabled,
  majorStringToFlittMinorUnits,
  toSafeFlittUserMessage,
  type FlittCheckoutRuntimeConfig,
  type PaymentProvider,
} from "./providers/flitt.js";
import {
  TbcCheckoutError,
  toSafeTbcUserMessage,
} from "./providers/tbc.js";
import {
  isConfiguredCheckoutEnabled,
  type CheckoutSelectionEnv,
} from "./payment-provider-selection.js";

export type CreditPackCheckoutResult = {
  purchaseId: string;
  status: string;
  approvalUrl: string;
  packageId: string;
  creditsAmount: number;
  priceAmount: number;
  currency: string;
};

export type CreditPackPurchaseView = {
  id: string;
  packageId: string;
  status: string;
  providerStatus: string | null;
  creditsAmount: number;
  priceAmount: number;
  currency: string;
  paidAt: string | null;
  creditedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CheckoutDeps = {
  prismaClient?: typeof prisma;
  env?: CheckoutSelectionEnv;
  createFlittProvider?: (config: FlittCheckoutRuntimeConfig) => FlittPaymentProvider;
  createIdFn?: () => string;
  resolveFlittConfig?: () => FlittCheckoutRuntimeConfig;
  getUsdGelQuote?: () => Promise<FxQuote>;
  fxRateProvider?: FxRateProvider;
};

function mapPurchaseView(row: CreditPackPurchase): CreditPackPurchaseView {
  return {
    id: row.id,
    packageId: row.packageId,
    status: row.status,
    providerStatus: row.providerStatus,
    creditsAmount: row.creditsAmount,
    priceAmount: Number(row.priceAmount),
    currency: row.currency,
    paidAt: row.paidAt?.toISOString() ?? null,
    creditedAt: row.creditedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function resolvePackageOrThrow(packageId: string): {
  id: PurchasableCreditPackageId;
  name: string;
  priceUsd: number;
  credits: number;
} {
  if (!isPurchasableCreditPackageId(packageId)) {
    throw new BadRequestError("Package is not purchasable", "PACKAGE_NOT_PURCHASABLE");
  }

  const purchasableId: PurchasableCreditPackageId = packageId;
  const pkg = getCreditPackage(purchasableId);
  return {
    id: purchasableId,
    name: pkg.name,
    priceUsd: pkg.priceUsd,
    credits: pkg.credits,
  };
}

export function mapFlittErrorToAppError(error: unknown): never {
  if (error instanceof AppError) {
    throw error;
  }

  if (error instanceof FlittCheckoutError) {
    const status =
      error.kind === "configuration"
        ? 503
        : error.kind === "validation"
          ? 400
          : 502;
    throw new AppError(toSafeFlittUserMessage(error), status, error.code);
  }

  throw error;
}

/** Legacy TBC callback/refund HTTP mapping. Not used for new checkout. */
export function mapTbcErrorToAppError(error: unknown): never {
  if (error instanceof AppError) {
    throw error;
  }

  if (error instanceof TbcCheckoutError) {
    const status =
      error.kind === "configuration"
        ? 503
        : error.kind === "validation"
          ? 400
          : 502;
    throw new AppError(toSafeTbcUserMessage(error), status, error.code);
  }

  throw error;
}

/** Convert provider errors for HTTP replies; pass through AppError / unknown. */
export function normalizeBillingError(error: unknown): unknown {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof FlittCheckoutError) {
    try {
      mapFlittErrorToAppError(error);
    } catch (mapped) {
      return mapped;
    }
  }

  if (error instanceof TbcCheckoutError) {
    try {
      mapTbcErrorToAppError(error);
    } catch (mapped) {
      return mapped;
    }
  }

  return error;
}

export function assertCheckoutAvailableOrThrow(env?: CheckoutSelectionEnv): void {
  if (isConfiguredCheckoutEnabled(env)) {
    return;
  }
  throw new ServiceUnavailableError("Credit pack checkout is not available");
}

/** Public CTA readiness. Flitt-only. TBC env never enables checkout. */
export function getCreditPackCheckoutStatus(
  env?: CheckoutSelectionEnv,
): CreditPackCheckoutStatus {
  return {
    checkoutEnabled: isConfiguredCheckoutEnabled(env),
  };
}

const UNAVAILABLE_PRICING_FX_QUOTE: CreditPackPricingFxQuote = {
  available: false,
  rate: null,
  quotedAt: null,
  source: null,
  packs: {
    starter: null,
    creator: null,
    studio: null,
  },
};

/**
 * Informational NBG-backed USD→GEL display for Pricing.
 * Fail soft: USD remains visible when FX is unavailable.
 * Checkout Buy still fail-closes via resolveUsdGelQuote.
 */
export async function getCreditPackPricingFxQuote(
  options: CheckoutDeps = {},
): Promise<CreditPackPricingFxQuote> {
  try {
    const quote = await resolveUsdGelQuote(options);
    const packs = {
      starter: convertUsdMajorToGel(
        String(getCreditPackagePriceUsd("starter")),
        quote.rate,
      ).gelMajor,
      creator: convertUsdMajorToGel(
        String(getCreditPackagePriceUsd("creator")),
        quote.rate,
      ).gelMajor,
      studio: convertUsdMajorToGel(
        String(getCreditPackagePriceUsd("studio")),
        quote.rate,
      ).gelMajor,
    };

    return {
      available: true,
      rate: quote.rate,
      quotedAt: quote.quotedAt.toISOString(),
      source: quote.source,
      packs,
    };
  } catch {
    return UNAVAILABLE_PRICING_FX_QUOTE;
  }
}

const CHECKOUT_RESUME_IN_FLIGHT = new Map<string, Promise<CreditPackCheckoutResult>>();

const RETRYABLE_STORED_FAILURE_CODES = new Set([
  "FLITT_NETWORK",
  "FLITT_CREATE_FAILED",
  "FLITT_PROVIDER_5XX",
  "FLITT_REQUEST_FAILED",
  "FLITT_RESPONSE_NOT_JSON",
  "FLITT_RESPONSE_NOT_OBJECT",
  "FLITT_PAYMENT_ID_MISSING",
  "FLITT_CHECKOUT_URL_UNTRUSTED",
  "FLITT_STATUS_INCOMPLETE",
]);

const NON_RESUMABLE_PURCHASE_STATUSES = new Set([
  "paid",
  "credited",
  "refunded",
  "partial_refunded",
  "expired",
  "cancelled",
  "verification_failed",
]);

function throwCheckoutInProgress(purchaseId: string): never {
  throw new AppError(
    `Checkout already in progress for this request (${purchaseId})`,
    409,
    "CHECKOUT_IN_PROGRESS",
  );
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return true;
  }
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function isDefinitiveFlittCreateError(error: unknown): boolean {
  return (
    error instanceof FlittCheckoutError &&
    (error.kind === "validation" || error.kind === "provider_4xx")
  );
}

function canResumeIncompleteFlittCheckout(existing: CreditPackPurchase): boolean {
  if (existing.provider !== FLITT_PAYMENT_PROVIDER) {
    return false;
  }
  if (existing.approvalUrl) {
    return false;
  }
  if (NON_RESUMABLE_PURCHASE_STATUSES.has(existing.status)) {
    return false;
  }
  if (existing.status === "failed") {
    return (
      existing.failureCode != null &&
      RETRYABLE_STORED_FAILURE_CODES.has(existing.failureCode)
    );
  }
  return (
    existing.status === "created" ||
    existing.status === "pending" ||
    existing.status === "provider_created"
  );
}

function toCheckoutResult(
  purchase: CreditPackPurchase,
  approvalUrl: string,
): CreditPackCheckoutResult {
  return {
    purchaseId: purchase.id,
    status: purchase.status,
    approvalUrl,
    packageId: purchase.packageId,
    creditsAmount: purchase.creditsAmount,
    priceAmount: Number(purchase.priceAmount),
    currency: purchase.currency,
  };
}

async function reuseExistingCheckout(
  existing: CreditPackPurchase | null,
  options: CheckoutDeps,
  config: FlittCheckoutRuntimeConfig,
): Promise<CreditPackCheckoutResult | null> {
  if (!existing) {
    return null;
  }

  if (existing.provider !== FLITT_PAYMENT_PROVIDER) {
    throwCheckoutInProgress(existing.id);
  }

  if (existing.approvalUrl) {
    return toCheckoutResult(existing, existing.approvalUrl);
  }

  if (!canResumeIncompleteFlittCheckout(existing)) {
    throwCheckoutInProgress(existing.id);
  }

  return completeFlittCheckoutCreation(existing, options, config);
}

function mapFxError(error: unknown): never {
  if (error instanceof FlittCheckoutError) {
    throw error;
  }
  if (error instanceof FxQuoteUnavailableError || error instanceof FxConversionError) {
    throw new FlittCheckoutError(error.message, "configuration", {
      code: error.code,
      cause: error,
    });
  }
  throw new FlittCheckoutError("USD/GEL FX quote is unavailable", "configuration", {
    code: "FX_QUOTE_UNAVAILABLE",
    cause: error,
  });
}

async function resolveUsdGelQuote(options: CheckoutDeps): Promise<FxQuote> {
  try {
    if (options.getUsdGelQuote) {
      return await options.getUsdGelQuote();
    }
    const provider =
      options.fxRateProvider ??
      createUsdGelFxProvider(
        options.env
          ? {
              FX_USD_GEL_PROVIDER: options.env.FX_USD_GEL_PROVIDER,
              APP_ENV: options.env.APP_ENV,
            }
          : {
              FX_USD_GEL_PROVIDER: process.env.FX_USD_GEL_PROVIDER,
              APP_ENV: process.env.APP_ENV,
            },
      );
    return await provider.getUsdGelQuote();
  } catch (error) {
    mapFxError(error);
  }
}

async function createFlittCreditPackCheckout(
  userId: string,
  input: CreateCreditPackCheckoutInput,
  options: CheckoutDeps & { locale?: string },
  config: FlittCheckoutRuntimeConfig,
): Promise<CreditPackCheckoutResult> {
  const db = options.prismaClient ?? prisma;
  const pkg = resolvePackageOrThrow(input.packageId);
  const usdMajor = getCreditPackagePriceUsd(pkg.id);

  if (config.currency !== "GEL") {
    throw new FlittCheckoutError("Flitt checkout currency must be GEL", "configuration", {
      code: "FLITT_CURRENCY_UNSUPPORTED",
    });
  }

  if (input.clientRequestId) {
    const existing = await db.creditPackPurchase.findUnique({
      where: {
        userId_clientRequestId: {
          userId,
          clientRequestId: input.clientRequestId,
        },
      },
    });
    const reused = await reuseExistingCheckout(existing, options, config);
    if (reused) {
      return reused;
    }
  }

  const quote = await resolveUsdGelQuote(options);
  const charge = convertUsdMajorToGel(String(usdMajor), quote.rate);
  const purchaseId = (options.createIdFn ?? randomUUID)();

  let purchase: CreditPackPurchase;
  try {
    purchase = await db.creditPackPurchase.create({
      data: {
        id: purchaseId,
        userId,
        provider: FLITT_PAYMENT_PROVIDER,
        packageId: pkg.id,
        priceAmount: new Prisma.Decimal(charge.gelMajor),
        currency: config.currency,
        basePriceAmount: new Prisma.Decimal(String(usdMajor)),
        baseCurrency: "USD",
        fxRate: new Prisma.Decimal(quote.rate),
        fxQuotedAt: quote.quotedAt,
        fxSource: quote.source,
        creditsAmount: pkg.credits,
        merchantPaymentId: purchaseId,
        status: "created",
        clientRequestId: input.clientRequestId ?? null,
      },
    });
  } catch (error) {
    if (input.clientRequestId && isPrismaUniqueConstraintError(error)) {
      const raced = await db.creditPackPurchase.findUnique({
        where: {
          userId_clientRequestId: {
            userId,
            clientRequestId: input.clientRequestId,
          },
        },
      });
      const reused = await reuseExistingCheckout(raced, options, config);
      if (reused) {
        return reused;
      }
    }
    throw error;
  }

  return completeFlittCheckoutCreation(purchase, options, config);
}

async function completeFlittCheckoutCreation(
  purchase: CreditPackPurchase,
  options: CheckoutDeps,
  config: FlittCheckoutRuntimeConfig,
): Promise<CreditPackCheckoutResult> {
  const inFlight = CHECKOUT_RESUME_IN_FLIGHT.get(purchase.id);
  if (inFlight) {
    return inFlight;
  }

  let resolveRun!: (value: CreditPackCheckoutResult) => void;
  let rejectRun!: (reason: unknown) => void;
  const run = new Promise<CreditPackCheckoutResult>((resolve, reject) => {
    resolveRun = resolve;
    rejectRun = reject;
  });
  CHECKOUT_RESUME_IN_FLIGHT.set(purchase.id, run);

  void submitFlittCheckout(purchase, options, config).then(resolveRun, rejectRun).finally(() => {
    CHECKOUT_RESUME_IN_FLIGHT.delete(purchase.id);
  });

  return run;
}

async function probeExistingFlittOrder(
  db: typeof prisma,
  purchase: CreditPackPurchase,
  provider: PaymentProvider,
): Promise<void> {
  try {
    const payment = await provider.getPayment(purchase.merchantPaymentId);
    await db.creditPackPurchase.update({
      where: { id: purchase.id },
      data: {
        providerPaymentId: payment.providerPaymentId,
        providerStatus: payment.providerStatus,
      },
    });
  } catch {
    // Status is optional. Unknown / network / incomplete → retry create with same order_id.
  }
}

async function submitFlittCheckout(
  purchase: CreditPackPurchase,
  options: CheckoutDeps,
  config: FlittCheckoutRuntimeConfig,
): Promise<CreditPackCheckoutResult> {
  const db = options.prismaClient ?? prisma;
  const pkg = resolvePackageOrThrow(purchase.packageId);
  const description = buildCreditPackPurchaseDescription(pkg.name, pkg.credits);
  const amountMinor = majorStringToFlittMinorUnits(purchase.priceAmount.toString());
  const provider =
    options.createFlittProvider?.(config) ?? FlittPaymentProvider.fromConfig(config);

  if (typeof provider.getPayment === "function") {
    await probeExistingFlittOrder(db, purchase, provider);
  }

  try {
    const checkout = await provider.createCheckout({
      orderId: purchase.merchantPaymentId,
      amountMinor,
      currency: purchase.currency,
      description,
      returnUrl: appendPurchaseIdToReturnUrl(
        config.returnUrl,
        purchase.merchantPaymentId,
      ),
      callbackUrl: config.callbackUrl,
    });

    const updated = await db.creditPackPurchase.update({
      where: { id: purchase.id },
      data: {
        providerPaymentId: checkout.providerPaymentId,
        providerStatus: checkout.providerStatus,
        approvalUrl: checkout.approvalUrl,
        status: "provider_created",
        failureCode: null,
        failureMessage: null,
      },
    });

    return toCheckoutResult(updated, checkout.approvalUrl);
  } catch (error) {
    const failureCode =
      error instanceof FlittCheckoutError ? error.code : "FLITT_CREATE_FAILED";
    const failureMessage = toSafeFlittUserMessage(error);

    if (isDefinitiveFlittCreateError(error)) {
      await db.creditPackPurchase.update({
        where: { id: purchase.id },
        data: {
          status: "failed",
          failureCode,
          failureMessage,
        },
      });
    } else {
      await db.creditPackPurchase.update({
        where: { id: purchase.id },
        data: {
          failureCode,
          failureMessage,
        },
      });
    }

    mapFlittErrorToAppError(error);
  }
}

export async function createCreditPackCheckout(
  userId: string,
  input: CreateCreditPackCheckoutInput,
  options: CheckoutDeps & { locale?: string } = {},
): Promise<CreditPackCheckoutResult> {
  if (!isConfiguredCheckoutEnabled(options.env)) {
    throw new ServiceUnavailableError("Credit pack checkout is not available");
  }

  const flittConfig = (options.resolveFlittConfig ?? (() => assertFlittCheckoutEnabled(options.env)))();
  return createFlittCreditPackCheckout(userId, input, options, flittConfig);
}

export async function getCreditPackPurchaseForUser(
  userId: string,
  purchaseId: string,
  options: { prismaClient?: typeof prisma } = {},
): Promise<CreditPackPurchaseView> {
  const db = options.prismaClient ?? prisma;
  const row = await db.creditPackPurchase.findFirst({
    where: { id: purchaseId, userId },
  });

  if (!row) {
    throw new NotFoundError("Purchase not found");
  }

  return mapPurchaseView(row);
}

/** Return URL / read endpoint must never grant credits — status only. */
export async function getCreditPackPurchaseStatusOnly(
  userId: string,
  purchaseId: string,
  options: { prismaClient?: typeof prisma } = {},
): Promise<CreditPackPurchaseView> {
  return getCreditPackPurchaseForUser(userId, purchaseId, options);
}

export {
  handleTbcCallback,
  reconcileTbcPurchase,
  type TbcCallbackResult,
} from "./tbc-payment-fulfillment.service.js";

export {
  handleFlittCallback,
  reconcileFlittPurchase,
  type FlittCallbackResult,
} from "./flitt-payment-fulfillment.service.js";
