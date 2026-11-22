export type Role = 'CUSTOMER' | 'ESTABLISHMENT';
export type Account = { id: string; email: string; name: string; role: Role };
export type Session = { user: Account; accessToken: string };
export type Allergen = { id: string; name: string };
export type Profile = Account & { allergens: Allergen[] };
export type Page<T> = { items: T[]; page: number; limit: number; hasMore: boolean };
export type VenueCategory = 'COFFEE_SHOP' | 'BAKERY' | 'RESTAURANT' | 'STORE';
export type OfferCategory = 'BAKED_GOODS' | 'DESSERTS' | 'PREPARED_MEALS' | 'SALADS' | 'GROCERIES';
export type OfferType = 'SURPRISE_BOX' | 'ITEM';
export type OfferSize = 'S' | 'M' | 'L';
export type VenueStatus = 'ACTIVE' | 'PENDING' | 'SUSPENDED';
export type Venue = {
  id: string; name: string; address: string | null; description: string | null; logoUrl: string | null;
  latitude: number | null; longitude: number | null; categories: VenueCategory[];
  publicEmail: string | null; publicPhone: string | null; deliveryEnabled: boolean;
  businessHours: Record<string, { opens: string; closes: string }> | null;
  status?: VenueStatus; rating?: number | null; reviewCount?: number;
};
export type OfferDetails = {
  id: string; name: string; description: string | null; type: OfferType; size: OfferSize | null;
  category: OfferCategory; price: number; originalPrice: number; weightGrams: number; allergens: Allergen[];
};
export type Offer = OfferDetails & {
  establishment: Venue; establishmentId: string; quantity: number; remainingQuantity: number;
  pickupStartsAt: string; pickupEndsAt: string; isAvailable: boolean; archivedAt: string | null;
  discountPercent: number; distanceKm: number | null; containsUserAllergens: boolean;
};
export type MapPoint = {
  id: string; name: string; address: string | null; latitude: number; longitude: number; availableOffers: number;
  minPrice: number; distanceKm: number | null;
};
export type OrderStatus = 'RESERVED' | 'PAID' | 'READY' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
export type Order = {
  id: string; establishmentId: string; status: OrderStatus; totalAmount: number; commissionAmount: number;
  createdAt: string; expiresAt: string; pickupStartsAt: string; pickupEndsAt: string;
  establishment: Pick<Venue, 'id' | 'name' | 'address'>;
  items: { offerId: string; offerName: string; quantity: number; unitPrice: number }[];
  pickup?: { pin: string; qrToken: string } | null;
};
export type Payment = { id: string; status: 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'PENDING'; amount: number; createdAt: string };
export type Review = { id: string; rating: number; comment: string | null; createdAt: string; customer: { name: string } };
export type Impact = { savedKg: number; estimatedCo2Kg: number; co2Factor: number };
export type Metrics = {
  completedOrders: number; soldUnits: number; soldBoxes: number; grossRevenue: number;
  commission: number; netRevenue: number; unsoldUnits: number; unsoldBoxes: number;
};
export type Analytics = { from: string; to: string; totals: Metrics; daily: (Metrics & { date: string })[] };
