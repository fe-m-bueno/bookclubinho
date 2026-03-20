export interface BadgeResponse {
  slug: string;
  name: string;
  description: string | null;
  emoji: string | null;
  category: string;
  earned_at: string | null;
  group_name: string | null;
  book_title: string | null;
}

export interface MyBadgesResponse {
  badges: Record<string, BadgeResponse[]>;
}

export interface BadgeCatalogResponse {
  badges: BadgeResponse[];
}

export interface BadgeProgressResponse {
  slug: string;
  name: string;
  emoji: string | null;
  current: number;
  target: number;
  percentage: number;
}
