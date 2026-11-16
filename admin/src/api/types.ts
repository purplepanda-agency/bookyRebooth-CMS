export type Role = "SUPER_ADMIN" | "ADMIN";

export type EntitySummary = {
  id: string;
  name: string;
  slug: string;
  active?: boolean;
};

export type Entity = EntitySummary & {
  active: boolean;
  domain?: string | null;
  createdAt?: string;
  updatedAt?: string;
  _count?: { users: number };
  users?: User[];
};

export type User = {
  id: string;
  email: string;
  role: Role;
  lastLoggedInAt?: string | null;
  createdAt?: string;
  entities: EntitySummary[];
};

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  entities: EntitySummary[];
};

export type ProductSetItem = {
  id?: string;
  name: string;
  photoUrl: string;
  sortOrder?: number;
};

export type ProductSet = {
  id: string;
  name: string;
  products: ProductSetItem[];
  entities?: Array<{ id: string; name: string; slug: string }>;
  createdAt?: string;
  updatedAt?: string;
};

export type Weekday =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export type Location = {
  id: string;
  name: string;
  imageUrl: string | null;
  address: string;
  googleMapsUrl: string;
  phone: string;
  email: string;
  permalink: string;
  entityId: string;
  entity?: EntitySummary | null;
};

export type Category = {
  id: string;
  name: string;
  imageUrl: string | null;
  slug: string;
  entityId: string;
  entity?: EntitySummary | null;
};

export type SellerSchedule = {
  id?: string;
  weekday: Weekday;
  startTime: string;
  endTime: string;
  locationId: string;
  location?: { id: string; name: string; permalink?: string } | null;
};

export type Seller = {
  id: string;
  name: string;
  email: string;
  imageUrl: string;
  active: boolean;
  entityId: string;
  primaryLocationId?: string | null;
  primaryLocation?: { id: string; name: string; permalink?: string } | null;
  entity?: EntitySummary | null;
  categories?: Category[];
  schedules: SellerSchedule[];
};

export type FlowStepType =
  | "FREE_CHOICE"
  | "PRODUCT_SET"
  | "LOCATIONS"
  | "CATEGORIES"
  | "SELLERS_AGENDA"
  | "CONFIRMATION";

export type FreeChoiceOption = {
  name: string;
  slug: string;
  imageUrl?: string | null;
};

export type FlowStep =
  | {
      id?: string;
      type: "FREE_CHOICE";
      config: { options: FreeChoiceOption[] };
    }
  | {
      id?: string;
      type: "PRODUCT_SET";
      config: {
        title: string;
        productSetId: string;
        allowNoProduct: boolean;
        noProductTitle: string;
        noProductImageUrl?: string | null;
      };
    }
  | {
      id?: string;
      type: "LOCATIONS";
      config: {
        title: string;
        locationIds: string[];
        showImage: boolean;
        imageFit: "contain" | "cover";
      };
    }
  | {
      id?: string;
      type: "CATEGORIES";
      config: {
        title: string;
        categoryIds: string[];
        showImage: boolean;
        imageFit: "contain" | "cover";
      };
    }
  | {
      id?: string;
      type: "SELLERS_AGENDA";
      config: Record<string, never>;
    }
  | {
      id?: string;
      type: "CONFIRMATION";
      config: { title: string };
    };

export type ContentBlockStepRef = {
  id: string;
  type: FlowStepType | string;
  sortOrder: number;
  title: string | null;
  flow: { id: string; name: string; slug: string };
};

export type ContentBlock = {
  id: string;
  title: string;
  text: string;
  buttonLabel: string | null;
  buttonUrl: string | null;
  active: boolean;
  sortOrder: number;
  entityId: string;
  entity?: EntitySummary | null;
  steps: ContentBlockStepRef[];
  createdAt?: string;
  updatedAt?: string;
};

export type Flow = {
  id: string;
  name: string;
  slug: string;
  featuredImage: string | null;
  active: boolean;
  sortOrder?: number;
  entityId: string;
  entity?: EntitySummary | null;
  steps?: FlowStep[];
  _count?: { steps: number };
  updatedAt?: string;
  createdAt?: string;
};
