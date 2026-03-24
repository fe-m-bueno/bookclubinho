import type { Metadata } from "next";
import { cookies } from "next/headers";
import { HomeClient } from "@/components/home/home-client";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Bookclubinho",
};

export default async function HomePage() {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.has("access_token");

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  return <HomeClient />;
}
