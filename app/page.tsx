// app/page.tsx
import MapPage from "./map/page";
import type { Metadata } from "next";

// 必要なら中身は好みで。空オブジェクトでもOK。
export const metadata: Metadata = {
  title: "CryptoPayMap",
  description: "Crypto-friendly places map",
};

export default MapPage;

