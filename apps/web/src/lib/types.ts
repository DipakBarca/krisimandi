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
