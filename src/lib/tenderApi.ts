const API_BASE_URL = import.meta.env.DEV
  ? '/api/v1'
  : import.meta.env.VITE_API_URL ||
    `${window.location.protocol}//${window.location.hostname}:5000/api/v1`;
const REQUEST_TIMEOUT_MS = 15000;
const DUPLICATE_EMAIL_MESSAGE =
  'Cette adresse e-mail est déjà associée à un compte. Connectez-vous si vous avez déjà un compte, ou utilisez une autre adresse.';

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'BUYER' | 'SELLER';
export class ApiError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export type VerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type DocumentVerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface Organization {
  id: number;
  type: 'BUYER' | 'SELLER';
  legalName: string;
  country: string;
  verificationStatus: VerificationStatus;
  registrationNumber?: string;
  pharmaceuticalLicense?: string | null;
  internalAdminNote?: string | null;
}

export interface TenderUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  organizationId: number | null;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  emailVerifiedAt: string | null;
  language: 'fr' | 'en' | 'ar';
  organization?: Organization | null;
}

export interface TenderItem {
  id: number;
  tenderId: number;
  genericName: string;
  dosage: string;
  dosageForm: string;
  packaging: string | null;
  quantity: number | string;
  unit: string;
  remarks: string | null;
}

export interface TenderRecord {
  id: number;
  reference: string;
  buyerOrgId: number;
  title: string;
  description: string;
  deliveryCountry: string;
  deliveryRegion: string | null;
  deadline: string;
  publishedAt: string | null;
  type: 'NORMAL' | 'URGENT';
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'IN_NEGOTIATION' | 'AWARDED' | 'CANCELLED';
  visibility: 'PUBLIC' | 'INVITATION_ONLY';
  sealedOffers: boolean;
  requiredDocuments: string[];
  items: TenderItem[];
  buyerOrganization?: Pick<Organization, 'id' | 'legalName' | 'country'>;
}

export interface OfferItem {
  id: number;
  tenderItemId: number;
  productId: number | null;
  unitPrice: number | string;
  moq: number | string;
  availableQuantity: number | string;
  lineTotal: number | string;
  tenderItem?: TenderItem;
}

export interface OfferRecord {
  id: number;
  tenderId: number;
  sellerOrgId: number;
  status: 'DRAFT' | 'SUBMITTED' | 'SHORTLISTED' | 'REJECTED' | 'WON' | 'WITHDRAWN';
  currency: string;
  totalAmount: number | string;
  deliveryDays: number;
  validityDays: number;
  incoterm: string;
  paymentTerms: string;
  comment: string | null;
  submittedAt?: string | null;
  items: OfferItem[];
  sellerOrganization?: Pick<Organization, 'id' | 'legalName' | 'country' | 'verificationStatus'>;
}

export interface ProductRecord {
  id: number;
  sellerOrgId: number;
  tradeName: string;
  genericName: string;
  dosage: string;
  dosageForm: string;
  packaging: string | null;
  manufacturer: string | null;
  originCountry: string;
  marketingAuthorization: string | null;
}

export interface PurchaseOrderRecord {
  id: number;
  number: string;
  status: string;
  amount: number | string;
  currency: string;
  tender: { id: number; reference: string; title: string; buyerOrgId: number };
  offer: { id: number; sellerOrgId: number; currency: string };
}

export interface ClarificationRecord {
  id: number;
  question: string;
  answer: string | null;
  tenderId: number;
  authorUserId: number;
  createdAt: string;
}

export interface MessageRecord {
  id: number;
  body: string;
  senderUserId: number;
  recipientUserId: number;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationRecord {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  link: string | null;
  createdAt: string;
}

export interface DocumentRecord {
  id: number;
  ownerOrgId: number;
  offerId: number | null;
  productId: number | null;
  tenderId: number | null;
  type: string;
  fileName: string;
  fileSize: number | string;
  mimeType: string;
  uploadedAt: string | null;
  expiresAt: string | null;
  verificationStatus: DocumentVerificationStatus;
}

export async function request<T>(path: string, init: RequestInit = {}, bearerToken?: string): Promise<T> {
  const token = bearerToken || localStorage.getItem('tenderingToken');
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const headers = new Headers(init.headers);
  if (!isFormData && init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abortFromCaller();
  else init.signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal
    });
    if (response.status === 204) return undefined as T;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (
        response.status === 409 &&
        typeof body.message === 'string' &&
        /e-?mail/i.test(body.message) &&
        /(déjà|already|exists)/i.test(body.message)
      ) {
        throw new ApiError(DUPLICATE_EMAIL_MESSAGE, body.code);
      }
      throw new ApiError(body.message || `Erreur API (${response.status}).`, body.code);
    }
    return body as T;
  } catch (error) {
    if (controller.signal.aborted && !init.signal?.aborted) {
      throw new Error('La demande prend plus de temps que prévu. Vérifiez votre connexion et réessayez dans un instant.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abortFromCaller);
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  postWithBearer: <T>(path: string, body: unknown, bearerToken: string) =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${bearerToken}` }
    }, bearerToken),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' })
};
