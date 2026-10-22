export type Named = { id: number; nameEn: string; nameNe: string };
export type Unit = Named & { code: string };
export type Crop = Named & { category: string; defaultUnitId: number; defaultUnit: Unit };
export type Municipality = Named & { districtId: number; type: string };
export type Ward = { id: number; municipalityId: number; wardNo: number; municipality?: Municipality & { district?: Named } };
export type Role = 'FARMER' | 'BUYER' | 'ADMIN';

export type Me = {
  id: string;
  phone: string;
  fullName: string;
  photoUrl: string | null;
  roles: Role[];
  preferredLang: 'ne' | 'en';
  wardId: number | null;
  village: string | null;
  isVerified: boolean;
  ward: Ward | null;
  profileComplete: boolean;
};

export type ListingStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'SOLD' | 'EXPIRED' | 'REMOVED';

export type Listing = {
  id: string;
  farmerId: string;
  crop: Crop;
  unit: Unit;
  variety: string | null;
  grade: string | null;
  description: string | null;
  quantity: string;
  quantityLeft: string;
  pricePerUnit: string | null;
  saleMode: 'FIXED' | 'AUCTION';
  harvestDate: string;
  availableUntil: string;
  village: string | null;
  status: ListingStatus;
  ward: Ward;
  photos: { id: string; url: string }[];
  location: { lat: number; lng: number; approximate?: boolean } | null;
  auction: {
    startPrice: string;
    reservePrice?: string | null;
    hasReserve: boolean;
    minIncrement: string;
    endsAt: string;
    status: string;
  } | null;
  farmer: { id: string; fullName: string; photoUrl: string | null; isVerified: boolean };
  createdAt: string;
};

/** A listing as search returns it: with the viewer's saved flag and, for nearby searches, a rounded distance. */
export type ListingResult = Listing & { saved?: boolean; distanceKm?: number | null };
export type ListingPage = { items: ListingResult[]; nextCursor: string | null };

export type CropAlert = {
  id: string;
  cropId: number;
  municipalityId: number | null;
  maxPrice: string | null;
  crop: Crop;
  municipality: Municipality | null;
};

type NamePair = { nameEn: string; nameNe: string };
export type AppNotification = {
  id: string;
  type: 'LISTING_MATCH' | string;
  readAt: string | null;
  createdAt: string;
  data: {
    listingId?: string;
    crop?: NamePair;
    unit?: NamePair;
    municipality?: NamePair;
    price?: string | null;
    village?: string | null;
    orderId?: string;
    complaintId?: string;
    reason?: string;
    rating?: number;
    status?: 'OPEN' | 'FOLLOWING_UP' | 'CLOSED';
  };
};

export type OfferStatus = 'OPEN' | 'COUNTERED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN';
export type Offer = {
  id: string;
  listingId: string;
  buyerId: string;
  pricePerUnit: string;
  quantity: string;
  pickupDate: string;
  parentOfferId: string | null;
  madeByFarmer: boolean;
  status: OfferStatus;
  expiresAt: string;
  createdAt: string;
  buyer: { id: string; fullName: string; isVerified: boolean };
  listing: Listing;
  order: { id: string } | null;
};

export type AuctionState = {
  listingId: string;
  status: 'SCHEDULED' | 'LIVE' | 'AWAITING_CONFIRMATION' | 'CLOSED' | 'NO_SALE';
  startPrice: string;
  minIncrement: string;
  endsAt: string;
  serverTime: string;
  confirmBy: string | null;
  highest: string | null;
  nextMin: string;
  bidCount: number;
  bidderCount: number;
  hasReserve: boolean;
  reserveMet: boolean;
  myHighest: string | null;
  iAmLeading: boolean;
  iAmWinner: boolean;
  winningAmount: string | null;
  winnerName: string | null;
  orderId?: string;
  bids: { amountPerUnit: string; placedAt: string; bidder: string; name?: string }[];
};

type Person = { id: string; fullName: string; photoUrl?: string | null; phone: string | null };
export type Conversation = {
  id: string;
  listingId: string;
  createdAt: string;
  listing: Listing;
  iAm: 'FARMER' | 'BUYER';
  dealAgreed: boolean;
  other: Person;
  lastMessage?: ChatMessage | null;
  unread?: number;
};
export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string | null;
  photoUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

export type Order = {
  id: string;
  listingId: string;
  buyerId: string;
  farmerId: string;
  pricePerUnit: string;
  quantity: string;
  pickupAt: string | null;
  pickupPlace: string | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  paidStatus: 'UNPAID' | 'PAID';
  buyerPaidAt: string | null;
  farmerPaidAt: string | null;
  cancelReason: string | null;
  cancelledById: string | null;
  completedAt: string | null;
  createdAt: string;
  listing: Listing;
  buyer: Person & { village: string | null };
  farmer: Person & { village: string | null };
  reviews: { id: string; reviewerId: string; rating: number; comment: string | null; createdAt: string }[];
};
export type OrderStatus = 'CONFIRMED' | 'READY_FOR_PICKUP' | 'PICKED_UP' | 'COMPLETED' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER';

export type PublicProfile = {
  id: string;
  fullName: string;
  photoUrl: string | null;
  roles: Role[];
  isVerified: boolean;
  village: string | null;
  ward: Ward | null;
  memberSince: string;
  rating: { average: number | null; count: number };
  activeListings: number;
};
export type Review = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewer: { id: string; fullName: string };
  order: { buyerId: string; listing: { crop: Names } };
};

export type ComplaintTarget = 'USER' | 'LISTING' | 'ORDER';
export type ComplaintStatus = 'OPEN' | 'FOLLOWING_UP' | 'CLOSED';
type Who = { id: string; fullName: string };
type Names = { nameEn: string; nameNe: string };
export type Complaint = {
  id: string;
  targetType: ComplaintTarget;
  targetId: string;
  reason: string;
  status: ComplaintStatus;
  adminNotes: string | null;
  createdAt: string;
  closedAt: string | null;
  /** Who or what the complaint is about; null if it no longer exists. */
  target: { id: string; fullName?: string; crop?: Names; farmer?: Who; buyer?: Who; listing?: { crop: Names } } | null;
  filedBy?: Who & { phone: string };
  handledBy?: Who | null;
};

export type AdminStats = {
  farmers: number;
  buyers: number;
  suspended: number;
  activeListings: number;
  orders: Partial<Record<OrderStatus, number>>;
  openComplaints: number;
  pendingDocs: number;
};
export type AdminUser = {
  id: string;
  phone: string;
  fullName: string;
  roles: Role[];
  village: string | null;
  isVerified: boolean;
  isSuspended: boolean;
  createdAt: string;
  _count: { listings: number; buyerOrders: number; farmerOrders: number };
};
export type AdminDoc = {
  id: string;
  docType: 'CITIZENSHIP' | 'PAN' | 'OTHER';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  user: { id: string; fullName: string; phone: string; village: string | null };
};
export type AuditEntry = {
  id: number;
  action: string;
  entity: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  actor: Who | null;
};
